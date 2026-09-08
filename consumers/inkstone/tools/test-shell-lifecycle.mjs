import assert from 'node:assert/strict';
import { InkstoneShellBridge } from '../src/shell/bridge.js';

const calls = [];
const phases = [];
const bridge = new InkstoneShellBridge({
  lifecycle: {
    requestPause: (reason) => calls.push(`pause:${reason}`),
    suspendAudio: (reason) => calls.push(`suspend:${reason}`),
    resumeAudio: (reason) => calls.push(`resume:${reason}`),
  },
});

bridge.shell = {
  session: {
    phase: 'playing',
    setPhase(phase) {
      this.phase = phase;
      phases.push(phase);
    },
  },
  studio: {
    telemetry: { record() {} },
    diagnostics: { capture() {} },
  },
};

bridge.syncState('PAUSE', 'RUN');
assert.equal(bridge.presentationSuspended, true);
assert.equal(calls.at(-1), 'suspend:game-pause');
assert.equal(phases.at(-1), 'paused');

bridge.syncState('RUN', 'PAUSE');
assert.equal(bridge.presentationSuspended, false);
assert.equal(calls.at(-1), 'resume:game-resume');
assert.equal(phases.at(-1), 'playing');

const beforeChoice = calls.length;
bridge.syncState('WAVE_CHOICE', 'RUN');
assert.equal(bridge.presentationSuspended, false);
assert.equal(calls.length, beforeChoice, 'WAVE_CHOICE must not suspend presentation audio');
assert.equal(phases.at(-1), 'paused');

const fakeWindow = new EventTarget();
const fakeDocument = new EventTarget();
Object.defineProperty(fakeDocument, 'hidden', { value: false, writable: true });
globalThis.window = fakeWindow;
globalThis.document = fakeDocument;

bridge.syncState('RUN', 'WAVE_CHOICE');
bridge.attachBrowserLifecycle();
assert.equal(bridge.browserLifecycleAttached, true);

fakeWindow.dispatchEvent(new Event('blur'));
assert.equal(calls.at(-1), 'pause:window-blur');

// Focus is telemetry-only. Resuming remains an explicit player action.
const beforeFocus = calls.length;
fakeWindow.dispatchEvent(new Event('focus'));
assert.equal(calls.length, beforeFocus, 'focus must not auto-resume or mutate presentation state');

bridge.lastGameState = 'RUN';
fakeDocument.hidden = true;
fakeDocument.dispatchEvent(new Event('visibilitychange'));
assert.equal(calls.at(-1), 'pause:document-hidden');

bridge.detachBrowserLifecycle();
assert.equal(bridge.browserLifecycleAttached, false);
const afterDetach = calls.length;
fakeWindow.dispatchEvent(new Event('blur'));
assert.equal(calls.length, afterDetach, 'detached lifecycle listeners must be inert');

delete globalThis.window;
delete globalThis.document;

console.log('INKSTONE V0.5 LIFECYCLE CONTRACT PASS');
