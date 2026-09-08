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
    studio.dev.registerPanel('Release', {
      description: 'Current V0.5 production ownership and release-runtime audit',
      read: () => ({
        version: bridge.version,
        platform: platform.status(),
        navigation: bridge.navigation?.status() || null,
        persistence: bridge.persistence?.status() || null,
        diagnostics: bridge.shell?.studio?.diagnostics?.snapshot?.().length || 0,
      }),
    });
    studio.dev.register('inkstone.platform.status', {
      description: 'Show browser capability and recovery state',
      run: () => JSON.stringify(platform.status(), null, 2),
    });
    studio.dev.register('inkstone.platform.audit', {
      description: 'Audit browser release capabilities and degraded-mode warnings',
      run: () => JSON.stringify(platform.releaseAudit(), null, 2),
    });
    studio.dev.register('inkstone.release.status', {
      description: 'Show current V0.5 release-runtime ownership status',
      run: () => JSON.stringify({
        version: bridge.version,
        protectedGameplayBaseline: 'Inkstone V0.4 feel lock',
        shellOwns: [
          'app-flow-graph', 'semantic-screen-history',
          'browser-focus-lifecycle', 'presentation-suspend',
          'safe-save-recovery', 'settings-mirroring',
          'browser-capability-audit', 'resize-lifecycle', 'fullscreen-service',
          'controller-lifecycle-telemetry', 'webgl-context-recovery',
          'runtime-diagnostics', 'player-safe-recovery-surface',
        ],
        inkstoneOwns: [
          'bespoke-screen-presentation', 'menu-focus', 'gameplay-input',
          'three-render-loop', 'fixed-step-sim', 'combat', 'ink-and-glyph-systems',
        ],
        platform: platform.status(),
      }, null, 2),
    });

    // Replace the earlier migration command with the current outermost truth.
    // DevConsoleRegistry is map-backed, so registering the same command name is
    // an intentional update rather than a second competing command.
    studio.dev.register('inkstone.migration', {
      description: 'Show current V0.5 Shell migration ownership status',
      run: () => JSON.stringify({
        mode: 'parity-first-release-runtime',
        shellOwns: [
          'app-flow', 'lifecycle', 'persistence-safety', 'settings-mirror',
          'platform-capabilities', 'resize', 'fullscreen', 'recovery', 'diagnostics',
        ],
        inkstoneOwns: [
          'screen-presentation', 'menu-focus', 'gameplay-input',
          'three-render-loop', 'fixed-step-sim', 'combat', 'ink-systems',
        ],
        platform: platform.status(),
      }, null, 2),
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
