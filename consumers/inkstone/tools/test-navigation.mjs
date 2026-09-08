import assert from 'node:assert/strict';
import {
  NAV_STATES,
  NAV_GRAPH,
  PAD_SMOKE_FLOWS,
  canNavigate,
  auditNavigationGraph,
  InkstoneNavigationCoordinator,
} from '../src/shell/navigation.js';

const audit = auditNavigationGraph();
assert.equal(audit.ok, true, `navigation graph audit failed: ${JSON.stringify(audit)}`);
assert.equal(NAV_STATES.length, 17, 'all current Game states remain represented');

for (const state of NAV_STATES) {
  assert.ok(Array.isArray(NAV_GRAPH[state]), `${state} needs an explicit outgoing edge list`);
  assert.equal(canNavigate(state, state), true, `${state} self transition must remain a safe no-op`);
}

// These semantic flows correspond to paths a player can drive with the shared
// MenuNav/pause controls. The test deliberately verifies edges, not DOM style.
for (const flow of PAD_SMOKE_FLOWS) {
  for (let i = 1; i < flow.length; i++) {
    assert.equal(
      canNavigate(flow[i - 1], flow[i]),
      true,
      `pad smoke route rejected ${flow[i - 1]} -> ${flow[i]} in ${flow.join(' > ')}`,
    );
  }
}

// Critical negative edges: these would skip required lifecycle/result steps.
for (const [from, to] of [
  ['TITLE', 'RESULTS'],
  ['SCROLL_SELECT', 'ARCHIVE'],
  ['WAVE_CHOICE', 'TITLE'],
  ['DEATH', 'RUN'],
  ['INKSTONE', 'RUN'],
  ['CREDITS', 'PLAY_SELECT'],
]) {
  assert.equal(canNavigate(from, to), false, `${from} -> ${to} must remain illegal`);
}

const events = [];
const rejected = [];
const nav = new InkstoneNavigationCoordinator({
  initial: 'BOOT',
  onEvent: (name, payload) => events.push([name, payload]),
  onRejected: (entry) => rejected.push(entry),
});

assert.equal(nav.request('TITLE').ok, true);
assert.equal(nav.request('PLAY_SELECT').ok, true);
assert.equal(nav.request('SCROLL_SELECT').ok, true);
assert.equal(nav.request('RUN').ok, true);
assert.equal(nav.request('PAUSE').ok, true);
assert.equal(nav.request('RUN').ok, true);
assert.equal(nav.request('DEATH').ok, true);
assert.equal(nav.request('RESULTS').ok, true);
assert.equal(nav.request('ARCHIVE').ok, false, 'results cannot jump directly to archive');
assert.equal(nav.current, 'RESULTS', 'a rejected edge must not mutate authority state');
assert.equal(rejected.length, 1);

assert.equal(nav.request('PLAY_SELECT').ok, true);
assert.equal(nav.request('TITLE').ok, true);
const status = await nav.flush();
assert.equal(status.current, 'TITLE');
assert.equal(status.screenManagerActive, 'TITLE', 'Shell ScreenManager mirror must settle on authority state');
assert.equal(status.audit.ok, true);
assert.ok(status.transitions >= 9);
assert.ok(events.some(([name]) => name === 'navigation.transition'));

console.log(`INKSTONE V0.5 NAVIGATION CONTRACT PASS — ${PAD_SMOKE_FLOWS.length} pad flows, ${NAV_STATES.length} states, rejection and ScreenManager parity verified.`);
