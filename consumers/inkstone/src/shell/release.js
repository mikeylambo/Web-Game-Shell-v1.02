import { createInkstoneShellBridge } from './bridge.js';
import { InkstonePlatformBridge } from './platform.js';

/**
 * Compose the already-migrated V0.5 Shell bridge with browser release services.
 * Keeping this as an outer composition layer avoids reopening combat/app-flow
 * code merely to add platform concerns.
 */
export async function createInkstoneReleaseRuntime({
  canvas = null,
  onResize = null,
  onReturnToTitle = null,
  onReload = null,
  ...shellOptions
} = {}) {
  const bridge = await createInkstoneShellBridge(shellOptions);

  const platform = new InkstonePlatformBridge({
    onEvent: (name, payload) => bridge.event(name, payload),
    onError: (scope, error) => {
      bridge.shell?.studio?.diagnostics?.capture?.(error, { scope: `inkstone.platform.${scope}` });
      bridge.event('platform.error-captured', {
        scope,
        message: error instanceof Error ? error.message : String(error),
      });
    },
    onReturnToTitle,
    onReload,
    onResize,
  });
  platform.start(canvas);
  bridge.platform = platform;

  // Move the existing Fullscreen row's implementation behind BrowserPlatform
  // without replacing the Options screen or its presentation.
  try {
    const { OPTION_DEFS } = await import('../playeroptions.js');
    const fullscreen = OPTION_DEFS.find((option) => option.id === 'fullscreen');
    if (fullscreen) fullscreen.write = () => { void platform.toggleFullscreen(); };
  } catch (error) {
    platform.reportError('fullscreen-hook', error);
  }

  const studio = bridge.shell?.studio;
  if (studio) {
    studio.dev.registerPanel('Platform', {
      description: 'Inkstone browser capabilities, controllers and recovery state',
      read: () => platform.status(),
    });
    studio.dev.register('inkstone.platform.status', {
      description: 'Show browser capability and recovery state',
      run: () => JSON.stringify(platform.status(), null, 2),
    });
    studio.dev.register('inkstone.platform.audit', {
      description: 'Audit browser release capabilities and degraded-mode warnings',
      run: () => JSON.stringify(platform.releaseAudit(), null, 2),
    });
    if (shellOptions.dev) {
      studio.dev.register('inkstone.recovery.test', {
        description: 'Show the player-safe recovery surface without exposing diagnostic detail',
        run: () => {
          platform.recovery?.show('Recovery surface test. No save or run data was changed.');
          return 'shown';
        },
      });
    }
  }

  const legacyDispose = bridge.dispose.bind(bridge);
  bridge.dispose = async () => {
    platform.dispose();
    await legacyDispose();
  };

  bridge.event('release-runtime.ready', platform.releaseAudit());
  return bridge;
}
