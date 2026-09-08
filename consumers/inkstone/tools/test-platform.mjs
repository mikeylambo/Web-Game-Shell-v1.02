import assert from 'node:assert/strict';
import { InkstonePlatformBridge } from '../src/shell/platform.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const storage = new MemoryStorage();
const docEvents = new Map();
const documentRef = {
  fullscreenElement: null,
  documentElement: {
    requestFullscreen: async () => { documentRef.fullscreenElement = documentRef.documentElement; },
    requestPointerLock() {},
  },
  exitFullscreen: async () => { documentRef.fullscreenElement = null; },
  exitPointerLock() {},
  addEventListener(name, fn) { docEvents.set(name, fn); },
  removeEventListener(name) { docEvents.delete(name); },
};
const windowRef = {
  localStorage: storage,
  location: { reload() { windowRef.reloads++; } },
  reloads: 0,
};
const navigatorRef = {
  clipboard: { writeText: async () => {} },
  getGamepads: () => [{ index: 0, id: 'Test Pad' }],
};

const platformCalls = [];
const browserPlatform = {
  onResize(fn) { platformCalls.push('resize-listener'); fn(1280, 720, 2); return () => platformCalls.push('resize-off'); },
  async requestFullscreen() { platformCalls.push('fullscreen-on'); documentRef.fullscreenElement = documentRef.documentElement; },
  async exitFullscreen() { platformCalls.push('fullscreen-off'); documentRef.fullscreenElement = null; },
};

let lifecycleHandlers = null;
let lifecycleDetached = false;
const lifecycleInstaller = (handlers, canvas) => {
  lifecycleHandlers = handlers;
  assert.equal(canvas.id, 'canvas');
  return () => { lifecycleDetached = true; };
};

const recovery = { shown: [], hidden: 0, disposed: 0 };
const recoveryMount = (opts) => {
  recovery.options = opts;
  return {
    show(message) { recovery.shown.push(message); },
    hide() { recovery.hidden++; },
    dispose() { recovery.disposed++; },
  };
};

const events = [];
const errors = [];
let titleReturns = 0;
let resize = null;

const platform = new InkstonePlatformBridge({
  browserPlatform,
  lifecycleInstaller,
  recoveryMount,
  windowRef,
  documentRef,
  navigatorRef,
  matchMediaRef: () => ({ matches: true }),
  onEvent: (name, payload) => events.push({ name, payload }),
  onError: (scope, error) => errors.push({ scope, error }),
  onReturnToTitle: () => { titleReturns++; },
  onResize: (width, height, dpr) => { resize = { width, height, dpr }; },
});

assert.deepEqual(platform.capabilities, {
  browser: true,
  localStorage: true,
  fullscreen: true,
  gamepad: true,
  clipboard: true,
  pointerLock: true,
  reducedMotion: true,
  webglContextEvents: true,
});
assert.equal(platform.releaseAudit().ok, true);
assert.deepEqual(platform.releaseAudit().blockers, []);

platform.start({ id: 'canvas' });
assert.deepEqual(resize, { width: 1280, height: 720, dpr: 2 });
assert.equal(platform.status().controllers[0].id, 'Test Pad');

lifecycleHandlers.onControllerConnected(2, 'Second Pad');
assert.equal(platform.status().controllers.length, 2);
lifecycleHandlers.onControllerDisconnected(2, 'Second Pad');
assert.equal(platform.status().controllers.length, 1);

lifecycleHandlers.onContextLost();
assert.equal(platform.contextLost, true);
assert.equal(recovery.shown.length, 1);
assert.equal(platform.retryRecovery(), false, 'context-loss retry must not fake success before restoration');
lifecycleHandlers.onContextRestored();
assert.equal(platform.contextLost, false);
assert.equal(recovery.hidden, 1);

assert.equal(await platform.toggleFullscreen(), true);
assert.equal(platformCalls.includes('fullscreen-on'), true);
assert.equal(await platform.toggleFullscreen(), true);
assert.equal(platformCalls.includes('fullscreen-off'), true);

platform.showFatal('test-fatal', new Error('boom'));
assert.equal(platform.status().lastFatal.scope, 'test-fatal');
assert.equal(errors.at(-1).scope, 'test-fatal');
assert.equal(platform.returnToTitle(), true);
assert.equal(titleReturns, 1);
assert.equal(platform.status().lastFatal, null);

platform.showFatal('reload-test', new Error('reload'));
assert.equal(platform.retryRecovery(), true);
assert.equal(windowRef.reloads, 1);

platform.dispose();
assert.equal(lifecycleDetached, true);
assert.equal(recovery.disposed, 1);
assert.equal(platformCalls.includes('resize-off'), true);
assert.equal(platform.started, false);
assert.ok(events.some((event) => event.name === 'platform.ready'));
assert.ok(events.some((event) => event.name === 'platform.context-lost'));
assert.ok(events.some((event) => event.name === 'platform.context-restored'));

// Degraded browser features are warnings, not blockers; the game can still
// run without fullscreen/gamepad/persistent storage, but Studio must say so.
const degraded = new InkstonePlatformBridge({
  browserPlatform: {},
  lifecycleInstaller: () => () => {},
  recoveryMount: () => ({ show() {}, hide() {}, dispose() {} }),
  windowRef: { localStorage: null },
  documentRef: { documentElement: {}, addEventListener() {}, removeEventListener() {} },
  navigatorRef: {},
  matchMediaRef: () => ({ matches: false }),
});
const degradedAudit = degraded.releaseAudit();
assert.equal(degradedAudit.ok, true);
assert.ok(degradedAudit.warnings.includes('persistent-storage-unavailable'));
assert.ok(degradedAudit.warnings.includes('fullscreen-unavailable'));
assert.ok(degradedAudit.warnings.includes('gamepad-api-unavailable'));

const nonBrowser = new InkstonePlatformBridge({
  browserPlatform: null,
  lifecycleInstaller: () => () => {},
  recoveryMount: () => ({ show() {}, hide() {}, dispose() {} }),
  windowRef: null,
  documentRef: null,
  navigatorRef: null,
  matchMediaRef: () => ({ matches: false }),
});
assert.equal(nonBrowser.releaseAudit().ok, false);
assert.ok(nonBrowser.releaseAudit().blockers.includes('browser-environment'));

console.log('INKSTONE V0.5 PLATFORM CONTRACT PASS — capabilities, resize, fullscreen, controller lifecycle and recovery verified.');