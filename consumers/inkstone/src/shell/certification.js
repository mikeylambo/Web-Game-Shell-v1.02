import { evaluatePerformanceBudget } from '@slu/web-shell';
import { auditNavigationGraph } from './navigation.js';

export const REQUIRED_ACCESSIBILITY_OPTIONS = Object.freeze([
  'deadzone',
  'invertX',
  'invertY',
  'shake',
  'hitStop',
  'flash',
  'camMotion',
  'highContrast',
  'textScale',
  'holdToggle',
]);

export const LIVE_PERFORMANCE_REQUIREMENTS = Object.freeze({
  minimumSamples: 120,
  p95FrameMs: 25,
  meanFrameMs: 20,
  minimumFps: 50,
});

function optionCoverage(optionDefs = []) {
  const ids = new Set(optionDefs.map((option) => option?.id).filter(Boolean));
  const missing = REQUIRED_ACCESSIBILITY_OPTIONS.filter((id) => !ids.has(id));
  return { ok: missing.length === 0, missing };
}

export function evaluateLivePerformance(summary = {}) {
  const requirements = LIVE_PERFORMANCE_REQUIREMENTS;
  const count = Number(summary.count) || 0;
  if (count < requirements.minimumSamples) {
    return {
      ok: false,
      reason: `need ${requirements.minimumSamples} frame samples; have ${count}`,
      summary: { ...summary },
      requirements,
    };
  }

  const p95 = evaluatePerformanceBudget(
    { frameMs: Number(summary.p95Ms) || 0 },
    { frameMs: requirements.p95FrameMs },
  );
  const mean = evaluatePerformanceBudget(
    { frameMs: Number(summary.meanMs) || 0, fps: Number(summary.fps) || 0 },
    { frameMs: requirements.meanFrameMs, fps: requirements.minimumFps },
  );
  const violations = [...p95.violations, ...mean.violations];

  return {
    ok: violations.length === 0,
    violations,
    summary: { ...summary },
    requirements,
  };
}

export function certificationFacts({ bridge, platform, optionDefs = [], auditOptions = null } = {}) {
  const persistence = bridge?.persistence?.status?.() || null;
  const navigation = auditNavigationGraph();
  const platformAudit = platform?.releaseAudit?.() || { ok: false, blockers: ['platform-not-started'], warnings: [] };
  const options = typeof auditOptions === 'function'
    ? auditOptions()
    : { ok: true, unresolvedPaths: [], duplicateIds: [] };
  const accessibility = optionCoverage(optionDefs);
  const diagnostics = bridge?.shell?.studio?.diagnostics?.snapshot?.() || [];
  const errors = diagnostics.filter((entry) => entry?.kind === 'error');
  const performance = evaluateLivePerformance(bridge?.shell?.studio?.frameTimes?.summary?.() || {});

  return {
    navigation,
    persistence,
    platform: platformAudit,
    options,
    accessibility,
    diagnostics: {
      total: diagnostics.length,
      errors: errors.length,
    },
    performance,
    recovery: {
      contextLost: !!platform?.contextLost,
      lastFatal: platform?.lastFatal ? { ...platform.lastFatal } : null,
    },
  };
}

export function createInkstoneCertificationProfile({ bridge, platform, optionDefs = [], auditOptions = null } = {}) {
  return {
    name: 'inkstone-v0.5-major-playtest',
    checks: {
      'navigation graph': () => {
        const audit = auditNavigationGraph();
        return audit.ok || `navigation audit failed: ${JSON.stringify(audit)}`;
      },
      'persistence healthy after recovery': () => {
        const recovery = bridge?.persistence?.status?.()?.lastRecovery;
        return recovery?.healthyAfter !== false || `persistence recovery unhealthy: ${JSON.stringify(recovery)}`;
      },
      'browser release blockers': () => {
        const audit = platform?.releaseAudit?.();
        if (!audit) return 'platform bridge is not available';
        return audit.ok || `platform blockers: ${(audit.blockers || []).join(', ')}`;
      },
      'no active graphics recovery': () => {
        if (platform?.contextLost) return 'WebGL context is currently lost';
        if (platform?.lastFatal) return `runtime fatal is still active: ${platform.lastFatal.scope}`;
        return true;
      },
      'player options schema': () => {
        if (typeof auditOptions !== 'function') return true;
        const audit = auditOptions();
        return audit.ok || `options audit failed: ${JSON.stringify(audit)}`;
      },
      'accessibility controls present': () => {
        const coverage = optionCoverage(optionDefs);
        return coverage.ok || `missing accessibility controls: ${coverage.missing.join(', ')}`;
      },
      'no captured runtime errors': () => {
        const entries = bridge?.shell?.studio?.diagnostics?.snapshot?.() || [];
        const errors = entries.filter((entry) => entry?.kind === 'error');
        return errors.length === 0 || `${errors.length} runtime diagnostic error(s) captured`;
      },
      'live performance evidence': () => {
        const result = evaluateLivePerformance(bridge?.shell?.studio?.frameTimes?.summary?.() || {});
        if (!result.ok && result.reason) return result.reason;
        return result.ok || `performance budget failed: ${JSON.stringify(result.violations)}`;
      },
    },
  };
}

export async function runInkstoneCertification({ bridge, platform, optionDefs = [], auditOptions = null } = {}) {
  if (!bridge?.shell?.studio?.certification) throw new Error('Shell CertificationRunner is unavailable.');
  const profile = createInkstoneCertificationProfile({ bridge, platform, optionDefs, auditOptions });
  return bridge.shell.studio.certification.run(profile);
}
