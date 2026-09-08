import {
  SLUWebShell,
  BrowserStorage,
  SettingsStore,
  AssemblyComposer,
  createCharacterActionAssembly,
  createArcadeAssembly,
  mountBrowserDevConsole,
} from '@slu/web-shell';
import { InkstonePersistenceBridge } from './persistence.js';

/**
 * V0.5 migration rule: move ownership across the seam only after parity.
 *
 * Inkstone's existing Game remains authoritative for player-facing app state,
 * semantic gameplay input, fixed-step simulation, rendering and combat. The
 * Shell owns production services, browser/presentation lifecycle, save safety
 * and the authoritative mirrored settings stores around Inkstone's compatible
 * legacy localStorage surface.
 */

const SHELL_NAMESPACE = 'inkstone-v05';

const PHASE_BY_STATE = {
  BOOT: 'boot',
  TITLE: 'title',
  PLAY_SELECT: 'menu',
  SCROLL_SELECT: 'menu',
  RUN_SETUP: 'menu',
  RUN: 'playing',
  PAUSE: 'paused',
  WAVE_CHOICE: 'paused',
  DEATH: 'results',
  MISSION_CLEAR: 'results',
  RESULTS: 'results',
  INKSTONE: 'menu',
  ARCHIVE: 'menu',
  OPTIONS: 'menu',
  CREDITS: 'menu',
  DEV_TUNING: 'menu',
  PILGRIMAGE: 'menu',
};

function safeJson(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return null; }
}

function settle(task, onError) {
  try {
    const result = task?.();
    if (result instanceof Promise) result.catch(onError);
  } catch (error) {
    onError(error);
  }
}

export class InkstoneShellBridge {
  constructor({ version, dev = false, snapshot = null, lifecycle = null } = {}) {
    this.version = version || 'dev';
    this.dev = !!dev;
    this.snapshot = typeof snapshot === 'function' ? snapshot : () => ({});
    this.lifecycle = lifecycle || {};
    this.shell = null;
    this.composer = null;
    this.storage = null;
    this.settings = null;
    this.persistence = null;
    this.devConsole = null;
    this.ready = false;
    this.lastGameState = 'BOOT';
    this.presentationSuspended = false;
    this.browserLifecycleAttached = false;
    this.lifecycleDisposers = [];
  }

  async boot() {
    this.storage = new BrowserStorage(SHELL_NAMESPACE);
    this.settings = SettingsStore.core(this.storage, 'settings');
    await this.settings.load();

    // Three.js scene/render-loop ownership deliberately stays in src/main.js.
    // Browser/presentation lifecycle is handled by this integration bridge.
    const rendererAdapter = {
      id: 'inkstone-three-parity',
      start() {},
      suspend() {},
      resume() {},
      loadLevel() {},
      unloadLevel() {},
    };

    this.shell = new SLUWebShell({
      build: {
        gameId: 'inkstone',
        gameName: 'INKSTONE',
        version: this.version,
        build: 'v0.5-persistence',
      },
      renderer: rendererAdapter,
      settings: this.settings,
    });

    this.composer = new AssemblyComposer(this.shell);
    const context = { shell: this.shell };
    await this.composer.add(createCharacterActionAssembly(context));
    await this.composer.add(createArcadeAssembly(context));
    await this.shell.boot();

    this.persistence = new InkstonePersistenceBridge({
      storage: this.storage,
      coreSettings: this.settings,
      onEvent: (name, payload) => this.event(name, payload),
      onError: (scope, error) => this.persistenceError(scope, error),
    });
    await this.persistence.boot();

    this.installInkstoneStudioSurface();
    this.ready = true;
    this.syncState(this.lastGameState, 'BOOT');
    return this;
  }

  installInkstoneStudioSurface() {
    const studio = this.shell?.studio;
    if (!studio) return;

    studio.dev.registerPanel('Inkstone', {
      description: 'Parity and ownership view during the V0.5 Shell migration',
      read: () => ({
        migrationMode: 'parity-first-persistence',
        gameState: this.lastGameState,
        shellPhase: this.shell.session.phase,
        presentationSuspended: this.presentationSuspended,
        browserLifecycleAttached: this.browserLifecycleAttached,
        persistence: this.persistence?.status() || null,
        assemblies: this.composer.listAssemblies(),
        modules: this.composer.modules.list(),
        modes: this.shell.modes.list(),
        snapshot: safeJson(this.snapshot()),
      }),
    });

    studio.dev.register('inkstone.snapshot', {
      description: 'Show the current deterministic/parity snapshot',
      run: () => JSON.stringify(this.paritySnapshot(), null, 2),
    });

    studio.dev.register('inkstone.migration', {
      description: 'Show V0.5 Shell migration ownership status',
      run: () => JSON.stringify({
        mode: 'parity-first-persistence',
        legacyOwns: ['app-flow', 'gameplay-input', 'fixed-step-sim', 'renderer', 'combat'],
        shellOwns: [
          'assemblies', 'studio-services', 'telemetry', 'diagnostics',
          'browser-focus-lifecycle', 'presentation-suspend',
          'save-backup-recovery', 'settings-mirroring',
        ],
        mirrored: ['game-phase', 'run-lifecycle', 'legacy-save-keys'],
        presentationSuspended: this.presentationSuspended,
        persistence: this.persistence?.status() || null,
      }, null, 2),
    });

    studio.dev.register('inkstone.save.status', {
      description: 'Show Shell-backed save recovery and settings status',
      run: () => JSON.stringify(this.persistence?.status() || null, null, 2),
    });

    studio.dev.register('inkstone.save.restore', {
      description: 'Restore the last validated backup into Inkstone compatibility keys',
      run: async () => JSON.stringify({ restored: await this.persistence?.restoreBackup() }, null, 2),
    });

    if (this.dev) {
      this.devConsole = mountBrowserDevConsole(studio.dev, {
        title: 'INKSTONE · SLU STUDIO',
        hotkey: 'F1',
        refreshMs: 500,
      });
    }
  }

  paritySnapshot() {
    const snap = safeJson(this.snapshot()) || {};
    return {
      gameState: this.lastGameState,
      shellPhase: this.shell?.session?.phase || 'unavailable',
      presentationSuspended: this.presentationSuspended,
      persistenceRecovery: this.persistence?.lastRecovery || null,
      ...snap,
    };
  }

  syncState(next, prev = this.lastGameState) {
    this.lastGameState = next || this.lastGameState;
    if (!this.shell) return;

    // PAUSE is a full presentation pause. WAVE_CHOICE deliberately shares the
    // Shell's paused phase but keeps presentation audio alive: it is gameplay,
    // not a browser/app suspension.
    const shouldSuspendPresentation = this.lastGameState === 'PAUSE';
    if (shouldSuspendPresentation && !this.presentationSuspended) {
      this.suspendPresentation('game-pause');
    } else if (!shouldSuspendPresentation && this.presentationSuspended) {
      this.resumePresentation('game-resume');
    }

    const phase = PHASE_BY_STATE[this.lastGameState] || 'menu';
    this.shell.session.setPhase(phase);
    this.shell.studio?.telemetry?.record('inkstone.state', {
      from: prev || null,
      to: this.lastGameState,
      phase,
      presentationSuspended: this.presentationSuspended,
    });
    void this.persistence?.queueSnapshot(`state:${this.lastGameState}`);
  }

  suspendPresentation(reason = 'unspecified') {
    if (this.presentationSuspended) return;
    this.presentationSuspended = true;
    this.event('lifecycle.suspend', { reason });
    settle(
      () => this.lifecycle.suspendAudio?.(reason),
      (error) => this.lifecycleError('suspend-audio', error),
    );
  }

  resumePresentation(reason = 'unspecified') {
    if (!this.presentationSuspended) return;
    this.presentationSuspended = false;
    this.event('lifecycle.resume', { reason });
    settle(
      () => this.lifecycle.resumeAudio?.(reason),
      (error) => this.lifecycleError('resume-audio', error),
    );
  }

  lifecycleError(scope, error) {
    this.shell?.studio?.diagnostics?.capture?.(error, { scope: `inkstone.lifecycle.${scope}` });
    this.event('lifecycle.error', {
      scope,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  persistenceError(scope, error) {
    this.shell?.studio?.diagnostics?.capture?.(error, { scope: `inkstone.persistence.${scope}` });
    this.event('persistence.error', {
      scope,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  requestPauseForBrowser(reason) {
    // Never pause menus/results, never convert WAVE_CHOICE to a menu pause, and
    // never auto-resume on focus. The existing Game pause path remains the one
    // place that clears input and shows the pause UI.
    if (this.lastGameState !== 'RUN') return false;
    this.event('lifecycle.pause-request', { reason });
    try {
      this.lifecycle.requestPause?.(reason);
      return true;
    } catch (error) {
      this.lifecycleError('request-pause', error);
      return false;
    }
  }

  attachBrowserLifecycle() {
    if (this.browserLifecycleAttached || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const onVisibility = () => {
      if (document.hidden) this.requestPauseForBrowser('document-hidden');
      else this.event('lifecycle.visible');
    };
    const onBlur = () => this.requestPauseForBrowser('window-blur');
    const onFocus = () => this.event('lifecycle.focus');
    const onPageHide = () => { void this.persistence?.queueSnapshot('pagehide'); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);

    this.lifecycleDisposers.push(
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => window.removeEventListener('blur', onBlur),
      () => window.removeEventListener('focus', onFocus),
      () => window.removeEventListener('pagehide', onPageHide),
    );
    this.browserLifecycleAttached = true;
    this.event('lifecycle.attached');
  }

  detachBrowserLifecycle() {
    for (const dispose of this.lifecycleDisposers.splice(0)) dispose();
    this.browserLifecycleAttached = false;
  }

  runStarted(config = {}) {
    if (!this.shell) return;
    this.shell.studio?.telemetry?.record('inkstone.run.start', safeJson(config) || {});
    void this.persistence?.queueSnapshot('run-start');
  }

  runFinished(summary = {}) {
    if (!this.shell) return;
    this.shell.studio?.telemetry?.record('inkstone.run.finish', {
      mode: summary.mode ?? null,
      scroll: summary.scroll ?? null,
      seed: summary.seed ?? null,
      score: summary.score ?? 0,
      wave: summary.wave ?? 0,
      rank: summary.rank?.grade ?? null,
      runHash: summary.runHash ?? null,
    });
    void this.persistence?.queueSnapshot('run-finish');
  }

  event(name, payload = {}) {
    this.shell?.studio?.telemetry?.record(`inkstone.${name}`, safeJson(payload) || {});
  }

  async dispose() {
    this.detachBrowserLifecycle();
    try { await this.persistence?.queueSnapshot('dispose'); } catch { /* diagnostics already record failures */ }
    this.devConsole?.dispose();
    this.devConsole = null;
    if (this.shell?.dispose) await this.shell.dispose();
    this.ready = false;
  }
}

export async function createInkstoneShellBridge(options) {
  const bridge = new InkstoneShellBridge(options);
  await bridge.boot();
  return bridge;
}
