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
import { InkstoneNavigationCoordinator, auditNavigationGraph } from './navigation.js';

/**
 * V0.5 migration rule: move ownership across the seam only after parity.
 *
 * Inkstone's existing DOM screens and MenuNav remain the presentation/focus
 * adapters. The Shell owns the legal app-flow graph, production services,
 * browser/presentation lifecycle, save recovery and mirrored settings. Combat,
 * simulation and rendering remain untouched behind the parity lock.
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
    this.navigation = null;
    this.devConsole = null;
    this.ready = false;
    this.lastGameState = 'BOOT';
    this.presentationSuspended = false;
    this.browserLifecycleAttached = false;
    this.lifecycleDisposers = [];
    this.gamePrototype = null;
    this.legacyGameSetState = null;
    this.navigationGuard = null;
  }

  async boot() {
    this.storage = new BrowserStorage(SHELL_NAMESPACE);
    this.settings = SettingsStore.core(this.storage, 'settings');
    await this.settings.load();

    // Three.js scene/render-loop ownership deliberately stays in src/main.js.
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
        build: 'v0.5-navigation',
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
    const recovery = await this.persistence.boot();
    await this.rehydratePersistenceConsumers(recovery);

    this.navigation = new InkstoneNavigationCoordinator({
      initial: this.lastGameState,
      onEvent: (name, payload) => this.event(name, payload),
      onRejected: (rejection) => this.navigationRejected(rejection),
    });
    await this.installNavigationAuthority();

    this.installInkstoneStudioSurface();
    this.ready = true;
    this.syncState(this.lastGameState, 'BOOT');
    return this;
  }

  async installNavigationAuthority() {
    const { Game } = await import('../game.js');
    const prototype = Game.prototype;

    if (prototype.setState?.__inkstoneShellNavigationGuard) {
      throw new Error('Inkstone Shell navigation guard is already installed.');
    }

    this.gamePrototype = prototype;
    this.legacyGameSetState = prototype.setState;
    const bridge = this;

    const guardedSetState = function guardedSetState(next) {
      const verdict = bridge.navigation.request(next, { reason: 'game.setState' });
      if (!verdict.ok) return this.state;
      return bridge.legacyGameSetState.call(this, next);
    };
    guardedSetState.__inkstoneShellNavigationGuard = true;
    prototype.setState = guardedSetState;
    this.navigationGuard = guardedSetState;
    this.event('navigation.authority-installed', { audit: auditNavigationGraph() });
  }

  uninstallNavigationAuthority() {
    if (!this.gamePrototype || !this.legacyGameSetState) return;
    if (this.gamePrototype.setState === this.navigationGuard) {
      this.gamePrototype.setState = this.legacyGameSetState;
    }
    this.gamePrototype = null;
    this.legacyGameSetState = null;
    this.navigationGuard = null;
  }

  async rehydratePersistenceConsumers(recovery) {
    // Input and PlayerOptions are module singletons created before Shell boot.
    // If persistence repaired their raw compatibility keys, reload them now so
    // the recovered data is active in this same launch.
    try {
      const [{ Input }, { PlayerOptions }] = await Promise.all([
        import('../input.js'),
        import('../playeroptions.js'),
      ]);
      Input.loadBindings();
      Input.rebuildLookup();
      PlayerOptions.load();
      this.event('persistence.rehydrated', {
        source: recovery?.source || 'empty',
        restored: recovery?.restored || [],
      });
    } catch (error) {
      this.persistenceError('rehydrate', error);
    }
  }

  installInkstoneStudioSurface() {
    const studio = this.shell?.studio;
    if (!studio) return;

    studio.dev.registerPanel('Inkstone', {
      description: 'Parity and ownership view during the V0.5 Shell migration',
      read: () => ({
        migrationMode: 'parity-first-navigation',
        gameState: this.lastGameState,
        shellPhase: this.shell.session.phase,
        navigation: this.navigation?.status() || null,
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
        mode: 'parity-first-navigation',
        legacyOwns: ['screen-presentation', 'menu-focus', 'gameplay-input', 'fixed-step-sim', 'renderer', 'combat'],
        shellOwns: [
          'app-flow-graph', 'semantic-screen-history',
          'assemblies', 'studio-services', 'telemetry', 'diagnostics',
          'browser-focus-lifecycle', 'presentation-suspend',
          'save-backup-recovery', 'settings-mirroring',
        ],
        mirrored: ['game-phase', 'run-lifecycle', 'legacy-save-keys'],
        navigation: this.navigation?.status() || null,
        presentationSuspended: this.presentationSuspended,
        persistence: this.persistence?.status() || null,
      }, null, 2),
    });

    studio.dev.register('inkstone.navigation.status', {
      description: 'Show Shell-owned navigation graph, history and rejected transitions',
      run: async () => JSON.stringify(await this.navigation?.flush(), null, 2),
    });

    studio.dev.register('inkstone.navigation.audit', {
      description: 'Audit the Inkstone V0.5 app-flow graph',
      run: () => JSON.stringify(auditNavigationGraph(), null, 2),
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
      navigationState: this.navigation?.current || null,
      presentationSuspended: this.presentationSuspended,
      persistenceRecovery: this.persistence?.lastRecovery || null,
      ...snap,
    };
  }

  syncState(next, prev = this.lastGameState) {
    this.lastGameState = next || this.lastGameState;
    if (!this.shell) return;

    // The navigation guard normally moved first. This resync is a diagnostic
    // safety net for any state assignment that bypassed Game.setState.
    if (this.navigation && this.navigation.current !== this.lastGameState) {
      this.event('navigation.desync', {
        coordinator: this.navigation.current,
        game: this.lastGameState,
      });
      this.navigation.sync(this.lastGameState, 'game-state-resync');
    }

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

  navigationRejected(rejection) {
    this.event('navigation.rejected', safeJson(rejection) || {});
    const message = rejection?.error instanceof Error
      ? rejection.error.message
      : `Rejected Inkstone transition ${rejection?.from || '?'} -> ${rejection?.to || '?'}`;
    this.shell?.studio?.diagnostics?.capture?.(new Error(message), {
      scope: 'inkstone.navigation',
      rejection: safeJson(rejection),
    });
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
    this.uninstallNavigationAuthority();
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
