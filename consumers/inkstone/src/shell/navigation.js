import { ScreenManager } from '@slu/web-shell';

/**
 * V0.5 app-flow ownership.
 *
 * Inkstone still renders its bespoke DOM screens and each screen still owns a
 * single MenuNav for focus. This coordinator owns the legal state graph and
 * the semantic history behind those surfaces. That separates "where may the
 * app go?" from "how does this screen look and focus its rows?".
 */

export const NAV_STATES = Object.freeze([
  'BOOT',
  'TITLE',
  'PLAY_SELECT',
  'SCROLL_SELECT',
  'RUN_SETUP',
  'RUN',
  'PAUSE',
  'WAVE_CHOICE',
  'DEATH',
  'MISSION_CLEAR',
  'RESULTS',
  'INKSTONE',
  'ARCHIVE',
  'OPTIONS',
  'CREDITS',
  'DEV_TUNING',
  'PILGRIMAGE',
]);

const ALL_MENU_RETURNS = [
  'TITLE', 'PLAY_SELECT', 'SCROLL_SELECT', 'RUN_SETUP',
  'INKSTONE', 'ARCHIVE', 'CREDITS', 'DEV_TUNING', 'PILGRIMAGE',
];

/** Explicit legal edges. Self-transitions are treated as no-ops separately. */
export const NAV_GRAPH = Object.freeze({
  BOOT: ['TITLE', 'OPTIONS', 'RUN'],
  TITLE: ['PLAY_SELECT', 'INKSTONE', 'ARCHIVE', 'OPTIONS', 'CREDITS', 'DEV_TUNING', 'RUN'],
  PLAY_SELECT: ['TITLE', 'PILGRIMAGE', 'SCROLL_SELECT', 'RUN_SETUP', 'RUN'],
  SCROLL_SELECT: ['PLAY_SELECT', 'RUN'],
  RUN_SETUP: ['PLAY_SELECT', 'RUN'],
  RUN: ['PAUSE', 'WAVE_CHOICE', 'DEATH', 'MISSION_CLEAR', 'TITLE', 'RUN'],
  PAUSE: ['RUN', 'PLAY_SELECT', 'RESULTS', 'TITLE'],
  WAVE_CHOICE: ['RUN'],
  DEATH: ['RESULTS'],
  MISSION_CLEAR: ['RESULTS'],
  RESULTS: ['RUN', 'PLAY_SELECT', 'TITLE'],
  INKSTONE: ['TITLE'],
  ARCHIVE: ['TITLE'],
  OPTIONS: ALL_MENU_RETURNS,
  CREDITS: ['TITLE'],
  DEV_TUNING: ['TITLE', 'OPTIONS'],
  PILGRIMAGE: ['PLAY_SELECT'],
});

export const PAD_SMOKE_FLOWS = Object.freeze([
  ['TITLE', 'PLAY_SELECT', 'SCROLL_SELECT', 'PLAY_SELECT', 'TITLE'],
  ['TITLE', 'INKSTONE', 'TITLE'],
  ['TITLE', 'ARCHIVE', 'TITLE'],
  ['TITLE', 'OPTIONS', 'TITLE'],
  ['TITLE', 'CREDITS', 'TITLE'],
  ['TITLE', 'PLAY_SELECT', 'PILGRIMAGE', 'PLAY_SELECT', 'RUN_SETUP', 'RUN', 'PAUSE', 'RUN'],
  ['RUN', 'WAVE_CHOICE', 'RUN'],
  ['RUN', 'DEATH', 'RESULTS', 'PLAY_SELECT', 'TITLE'],
  ['RUN', 'PAUSE', 'RESULTS', 'RUN'],
]);

function cleanState(value) {
  return typeof value === 'string' ? value.toUpperCase() : '';
}

export function canNavigate(from, to) {
  const a = cleanState(from);
  const b = cleanState(to);
  if (!NAV_STATES.includes(a) || !NAV_STATES.includes(b)) return false;
  if (a === b) return true;
  return (NAV_GRAPH[a] || []).includes(b);
}

export function auditNavigationGraph() {
  const unknownEdges = [];
  const missingStates = [];
  const unreachable = new Set(NAV_STATES.filter((s) => s !== 'BOOT'));
  const seen = new Set(['BOOT']);
  const queue = ['BOOT'];

  for (const state of NAV_STATES) {
    if (!Object.prototype.hasOwnProperty.call(NAV_GRAPH, state)) missingStates.push(state);
    for (const next of NAV_GRAPH[state] || []) {
      if (!NAV_STATES.includes(next)) unknownEdges.push(`${state}->${next}`);
    }
  }

  while (queue.length) {
    const state = queue.shift();
    for (const next of NAV_GRAPH[state] || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      unreachable.delete(next);
      queue.push(next);
    }
  }

  return {
    ok: unknownEdges.length === 0 && missingStates.length === 0 && unreachable.size === 0,
    unknownEdges,
    missingStates,
    unreachable: [...unreachable],
  };
}

export class InkstoneNavigationCoordinator {
  constructor({ initial = 'BOOT', onEvent = null, onRejected = null } = {}) {
    const state = cleanState(initial);
    if (!NAV_STATES.includes(state)) throw new Error(`Unknown initial Inkstone state: ${initial}`);
    this.current = state;
    this.history = [];
    this.transitions = 0;
    this.rejections = [];
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.onRejected = typeof onRejected === 'function' ? onRejected : () => {};

    // Shell ScreenManager owns the semantic screen registry/history mirror.
    // Inkstone's existing screen objects remain the visual adapters during V0.5.
    this.screenManager = new ScreenManager();
    this.screenManager.register(NAV_STATES.map((id) => ({ id })));
    void this.screenManager.show(state, undefined, false);
  }

  request(next, { reason = 'legacy-setState', remember = true } = {}) {
    const target = cleanState(next);
    const from = this.current;

    if (!canNavigate(from, target)) {
      const rejection = { from, to: target || String(next), reason, at: Date.now() };
      this.rejections.push(rejection);
      if (this.rejections.length > 20) this.rejections.shift();
      this.onRejected(rejection);
      return { ok: false, changed: false, from, to: target };
    }

    if (from === target) return { ok: true, changed: false, from, to: target };

    if (remember) this.history.push(from);
    if (this.history.length > 64) this.history.shift();
    this.current = target;
    this.transitions++;
    void this.screenManager.show(target, { from, reason }, remember).catch((error) => {
      this.onRejected({ from, to: target, reason: 'screen-manager', error });
    });
    this.onEvent('navigation.transition', { from, to: target, reason, transitions: this.transitions });
    return { ok: true, changed: true, from, to: target };
  }

  sync(actual, reason = 'legacy-sync') {
    const state = cleanState(actual);
    if (!NAV_STATES.includes(state)) return false;
    this.current = state;
    void this.screenManager.show(state, { reason }, false).catch(() => {});
    return true;
  }

  status() {
    return {
      current: this.current,
      screenManagerActive: this.screenManager.activeId(),
      transitions: this.transitions,
      history: [...this.history],
      rejections: [...this.rejections],
      audit: auditNavigationGraph(),
    };
  }
}
