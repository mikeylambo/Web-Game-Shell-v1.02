import * as Tone from 'tone';

/**
 * Presentation-only Web Audio lifecycle adapter for the V0.5 Shell seam.
 * It never changes mixer values, voices, schedules, combat cues or simulation.
 */
function rawContext() {
  const toneContext = Tone.getContext?.();
  return toneContext?.rawContext ?? toneContext ?? null;
}

export async function suspendPresentationAudio() {
  const context = rawContext();
  if (!context || context.state !== 'running' || typeof context.suspend !== 'function') return false;
  await context.suspend();
  return true;
}

export async function resumePresentationAudio() {
  const context = rawContext();
  if (!context || context.state !== 'suspended' || typeof context.resume !== 'function') return false;
  await context.resume();
  return true;
}
