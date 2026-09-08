import assert from 'node:assert/strict';
import { CertificationRunner } from '@slu/web-shell';
import {
  REQUIRED_ACCESSIBILITY_OPTIONS,
  LIVE_PERFORMANCE_REQUIREMENTS,
  evaluateLivePerformance,
  createInkstoneCertificationProfile,
} from '../src/shell/certification.js';

const goodSummary = {
  count: LIVE_PERFORMANCE_REQUIREMENTS.minimumSamples,
  meanMs: 16.5,
  p95Ms: 19.2,
  worstMs: 24,
  fps: 60.6,
};

assert.equal(evaluateLivePerformance({ count: 20 }).ok, false, 'insufficient frame evidence must fail');
assert.equal(evaluateLivePerformance(goodSummary).ok, true, 'healthy live frame evidence should pass');
assert.equal(evaluateLivePerformance({ ...goodSummary, p95Ms: 40 }).ok, false, 'slow p95 must fail');

const optionDefs = REQUIRED_ACCESSIBILITY_OPTIONS.map((id) => ({ id }));
const diagnostics = [];
const bridge = {
  persistence: { status: () => ({ lastRecovery: { healthyAfter: true } }) },
  shell: {
    studio: {
      diagnostics: { snapshot: () => diagnostics },
      frameTimes: { summary: () => goodSummary },
    },
  },
};
const platform = {
  contextLost: false,
  lastFatal: null,
  releaseAudit: () => ({ ok: true, blockers: [], warnings: [] }),
};
const auditOptions = () => ({ ok: true, unresolvedPaths: [], duplicateIds: [] });

const runner = new CertificationRunner();
let report = await runner.run(createInkstoneCertificationProfile({
  bridge, platform, optionDefs, auditOptions,
}));
assert.equal(report.ok, true, `healthy profile should certify: ${JSON.stringify(report.results)}`);

// Accessibility is contractual: deleting one required player control fails certification.
report = await runner.run(createInkstoneCertificationProfile({
  bridge,
  platform,
  optionDefs: optionDefs.filter((option) => option.id !== 'flash'),
  auditOptions,
}));
assert.equal(report.ok, false);
assert.ok(report.results.some((result) => result.name === 'accessibility controls present' && result.status === 'fail'));

// Active runtime faults and graphics loss are blockers, not warnings.
platform.contextLost = true;
report = await runner.run(createInkstoneCertificationProfile({ bridge, platform, optionDefs, auditOptions }));
assert.equal(report.ok, false);
platform.contextLost = false;

diagnostics.push({ kind: 'error', message: 'synthetic failure' });
report = await runner.run(createInkstoneCertificationProfile({ bridge, platform, optionDefs, auditOptions }));
assert.equal(report.ok, false);
assert.ok(report.results.some((result) => result.name === 'no captured runtime errors' && result.status === 'fail'));

console.log('INKSTONE V0.5 CERTIFICATION CONTRACT PASS — accessibility, recovery, diagnostics and live performance evidence are release gates.');
