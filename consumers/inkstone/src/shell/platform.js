import {
  BrowserPlatform,
  installBrowserLifecycle,
  mountRecoveryUI,
  prefersReducedMotion,
} from '@slu/web-shell';

function bool(v) { return !!v; }

/**
 * Browser/platform ownership for Inkstone V0.5.
 *
 * This layer owns browser capabilities and recovery presentation. It does not
 * own combat, rendering, screen fiction or semantic gameplay input.
 */
export class InkstonePlatformBridge {
  constructor({
    browserPlatform = null,
    lifecycleInstaller = installBrowserLifecycle,
    recoveryMount = mountRecoveryUI,
    windowRef = typeof window !== 'undefined' ? window : null,
    documentRef = typeof document !== 'undefined' ? document : null,
    navigatorRef = typeof navigator !== 'undefined' ? navigator : null,
    matchMediaRef = typeof matchMedia !== 'undefined' ? matchMedia : null,
    onEvent = null,
    onError = null,
    onReturnToTitle = null,
    onReload = null,
    onResize = null,
  } = {}) {
    this.windowRef = windowRef;
    this.documentRef = documentRef;
    this.navigatorRef = navigatorRef;
    this.matchMediaRef = matchMediaRef;
    this.browser = browserPlatform || (documentRef ? new BrowserPlatform() : null);
    this.lifecycleInstaller = lifecycleInstaller;
    this.recoveryMount = recoveryMount;
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.onError = typeof onError === 'function' ? onError : () => {};
    this.onReturnToTitle = typeof onReturnToTitle === 'function' ? onReturnToTitle : () => {};
    this.onReload = typeof onReload === 'function'
      ? onReload
      : () => this.windowRef?.location?.reload?.();
    this.onResize = typeof onResize === 'function' ? onResize : () => {};
    this.canvas = null;
    this.detachLifecycle = null;
    this.detachResize = null;
    this.detachFullscreen = null;
    this.recovery = null;
    this.contextLost = false;
    this.controllers = new Map();
    this.lastFatal = null;
    this.started = false;
    this.capabilities = this.detectCapabilities();
  }

  detectCapabilities() {
    const d = this.documentRef;
    const n = this.navigatorRef;
    const w = this.windowRef;
    let localStorageAvailable = false;
    try {
      const s = w?.localStorage;
      if (s) {
        const key = '__inkstone_capability_probe__';
        s.setItem(key, '1');
        s.removeItem(key);
        localStorageAvailable = true;
      }
    } catch { /* unavailable storage is a supported degraded mode */ }

    let reducedMotion = false;
    try {
      reducedMotion = this.matchMediaRef
        ? bool(this.matchMediaRef('(prefers-reduced-motion: reduce)').matches)
        : prefersReducedMotion();
    } catch { reducedMotion = false; }

    return {
      browser: bool(w && d),
      localStorage: localStorageAvailable,
      fullscreen: bool(d?.documentElement?.requestFullscreen && d?.exitFullscreen),
      gamepad: bool(n && typeof n.getGamepads === 'function'),
      clipboard: bool(n?.clipboard?.writeText),
      pointerLock: bool(d?.documentElement?.requestPointerLock && d?.exitPointerLock),
      reducedMotion,
      webglContextEvents: true,
    };
  }

  start(canvas = null) {
    if (this.started) return this.status();
    this.started = true;
    this.canvas = canvas || null;

    this.recovery = this.recoveryMount({
      message: 'The display was interrupted. Inkstone can retry or return to the title.',
      retryLabel: 'RETRY',
      menuLabel: 'TITLE',
      onRetry: () => this.retryRecovery(),
      onMenu: () => this.returnToTitle(),
    });

    this.detachLifecycle = this.lifecycleInstaller({
      onControllerConnected: (index, id) => {
        this.controllers.set(index, id);
        this.onEvent('platform.controller-connected', { index, id });
      },
      onControllerDisconnected: (index, id) => {
        this.controllers.delete(index);
        this.onEvent('platform.controller-disconnected', { index, id });
      },
      onContextLost: () => {
        this.contextLost = true;
        this.onEvent('platform.context-lost');
        this.recovery?.show('The display was interrupted. Inkstone is waiting for the graphics context to recover.');
      },
      onContextRestored: () => {
        this.contextLost = false;
        this.onEvent('platform.context-restored');
        if (!this.lastFatal) this.recovery?.hide();
      },
    }, this.canvas || undefined);

    if (this.browser) {
      this.detachResize = this.browser.onResize((width, height, dpr) => {
        try { this.onResize(width, height, dpr); }
        catch (error) { this.reportError('resize', error); }
      });
    }

    if (this.documentRef) {
      const onFullscreen = () => {
        this.onEvent('platform.fullscreen', { active: !!this.documentRef.fullscreenElement });
      };
      this.documentRef.addEventListener('fullscreenchange', onFullscreen);
      this.detachFullscreen = () => this.documentRef.removeEventListener('fullscreenchange', onFullscreen);
    }

    this.seedConnectedControllers();
    this.onEvent('platform.ready', this.status());
    return this.status();
  }

  seedConnectedControllers() {
    if (!this.capabilities.gamepad) return;
    try {
      for (const pad of this.navigatorRef.getGamepads() || []) {
        if (pad) this.controllers.set(pad.index, pad.id);
      }
    } catch (error) { this.reportError('gamepad-enumeration', error); }
  }

  async toggleFullscreen() {
    if (!this.browser || !this.capabilities.fullscreen) {
      this.onEvent('platform.fullscreen-unavailable');
      return false;
    }
    try {
      if (this.documentRef?.fullscreenElement) await this.browser.exitFullscreen();
      else await this.browser.requestFullscreen(this.documentRef?.documentElement);
      return true;
    } catch (error) {
      this.reportError('fullscreen', error);
      return false;
    }
  }

  showFatal(scope, error) {
    const message = error instanceof Error ? error.message : String(error);
    this.lastFatal = { scope, message, at: new Date().toISOString() };
    this.onError(scope, error);
    this.onEvent('platform.fatal', { scope, message });
    this.recovery?.show('Inkstone hit a runtime problem. You can retry the current build or return to the title.');
  }

  clearFatal() {
    this.lastFatal = null;
    if (!this.contextLost) this.recovery?.hide();
  }

  retryRecovery() {
    this.onEvent('platform.recovery-retry', {
      contextLost: this.contextLost,
      fatal: this.lastFatal?.scope || null,
    });
    // A WebGL context normally restores itself. If it is still lost, keep the
    // safe surface up rather than pretending retry succeeded.
    if (this.contextLost && !this.lastFatal) return false;
    try { this.onReload(); return true; }
    catch (error) { this.reportError('recovery-reload', error); return false; }
  }

  returnToTitle() {
    this.onEvent('platform.recovery-title');
    try {
      this.onReturnToTitle();
      this.clearFatal();
      return true;
    } catch (error) {
      this.reportError('recovery-title', error);
      return false;
    }
  }

  reportError(scope, error) {
    this.onError(scope, error);
    this.onEvent('platform.error', {
      scope,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  releaseAudit() {
    const warnings = [];
    const blockers = [];
    if (!this.capabilities.browser) blockers.push('browser-environment');
    if (!this.capabilities.localStorage) warnings.push('persistent-storage-unavailable');
    if (!this.capabilities.fullscreen) warnings.push('fullscreen-unavailable');
    if (!this.capabilities.gamepad) warnings.push('gamepad-api-unavailable');
    return {
      ok: blockers.length === 0,
      blockers,
      warnings,
      capabilities: { ...this.capabilities },
    };
  }

  status() {
    return {
      started: this.started,
      contextLost: this.contextLost,
      controllers: [...this.controllers.entries()].map(([index, id]) => ({ index, id })),
      fullscreenActive: !!this.documentRef?.fullscreenElement,
      lastFatal: this.lastFatal ? { ...this.lastFatal } : null,
      audit: this.releaseAudit(),
    };
  }

  dispose() {
    this.detachLifecycle?.();
    this.detachResize?.();
    this.detachFullscreen?.();
    this.detachLifecycle = null;
    this.detachResize = null;
    this.detachFullscreen = null;
    this.recovery?.dispose();
    this.recovery = null;
    this.started = false;
  }
}
