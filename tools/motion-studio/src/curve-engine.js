export const Interpolation = Object.freeze({
  STEP: 'step',
  LINEAR: 'linear',
  SMOOTH: 'smooth',
  BEZIER: 'bezier',
});

const EPS = 1e-8;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smoothstep = (v) => { const u = clamp01(v); return u * u * (3 - 2 * u); };

export function createCurveKey(time, value, options = {}) {
  return {
    time: Number(time),
    value: Number(value),
    interpolation: options.interpolation ?? Interpolation.SMOOTH,
    inTangent: Number(options.inTangent ?? 0),
    outTangent: Number(options.outTangent ?? 0),
  };
}

export function normalizeCurve(keys = []) {
  return keys
    .map((key) => createCurveKey(key.time, key.value, key))
    .filter((key) => Number.isFinite(key.time) && Number.isFinite(key.value))
    .sort((a, b) => a.time - b.time)
    .filter((key, index, all) => index === all.length - 1 || Math.abs(key.time - all[index + 1].time) > EPS);
}

export function upsertCurveKey(keys, nextKey, epsilon = 1e-4) {
  const curve = normalizeCurve(keys);
  const key = createCurveKey(nextKey.time, nextKey.value, nextKey);
  const index = curve.findIndex((existing) => Math.abs(existing.time - key.time) <= epsilon);
  if (index >= 0) curve[index] = key;
  else curve.push(key);
  return normalizeCurve(curve);
}

export function removeCurveKey(keys, index) {
  const curve = normalizeCurve(keys);
  if (index >= 0 && index < curve.length) curve.splice(index, 1);
  return curve;
}

export function moveCurveKey(keys, index, time, value) {
  const curve = normalizeCurve(keys);
  if (index < 0 || index >= curve.length) return curve;
  const moved = { ...curve[index], time: Number(time), value: Number(value) };
  curve.splice(index, 1);
  return upsertCurveKey(curve, moved);
}

function hermite(p0, m0, p1, m1, u, dt) {
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return h00 * p0 + h10 * m0 * dt + h01 * p1 + h11 * m1 * dt;
}

function autoTangent(keys, index) {
  if (keys.length < 2) return 0;
  if (index <= 0) {
    const a = keys[0], b = keys[1];
    return (b.value - a.value) / Math.max(EPS, b.time - a.time);
  }
  if (index >= keys.length - 1) {
    const a = keys.at(-2), b = keys.at(-1);
    return (b.value - a.value) / Math.max(EPS, b.time - a.time);
  }
  const a = keys[index - 1], b = keys[index + 1];
  return (b.value - a.value) / Math.max(EPS, b.time - a.time);
}

export function sampleCurve(inputKeys, time, fallback = 0) {
  const keys = normalizeCurve(inputKeys);
  if (!keys.length) return fallback;
  if (keys.length === 1 || time <= keys[0].time) return keys[0].value;
  if (time >= keys.at(-1).time) return keys.at(-1).value;

  let leftIndex = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    if (time >= keys[i].time && time <= keys[i + 1].time) { leftIndex = i; break; }
  }
  const a = keys[leftIndex], b = keys[leftIndex + 1];
  const dt = Math.max(EPS, b.time - a.time);
  const u = clamp01((time - a.time) / dt);

  switch (a.interpolation) {
    case Interpolation.STEP: return a.value;
    case Interpolation.LINEAR: return a.value + (b.value - a.value) * u;
    case Interpolation.BEZIER:
      return hermite(a.value, a.outTangent, b.value, b.inTangent, u, dt);
    case Interpolation.SMOOTH:
    default: {
      const m0 = autoTangent(keys, leftIndex);
      const m1 = autoTangent(keys, leftIndex + 1);
      return hermite(a.value, m0, b.value, m1, smoothstep(u), dt);
    }
  }
}

export function createTransformCurves() {
  const channels = {};
  for (const property of ['position', 'rotation', 'scale']) {
    channels[property] = { x: [], y: [], z: [] };
  }
  return channels;
}

export function sampleTransformCurves(curves, time, defaults = {}) {
  const result = {};
  for (const property of ['position', 'rotation', 'scale']) {
    const base = defaults[property] ?? (property === 'scale' ? [1, 1, 1] : [0, 0, 0]);
    result[property] = ['x', 'y', 'z'].map((axis, index) =>
      sampleCurve(curves?.[property]?.[axis] ?? [], time, base[index]));
  }
  return result;
}

export function serializeCurveSet(curves) {
  const result = createTransformCurves();
  for (const property of Object.keys(result)) {
    for (const axis of Object.keys(result[property])) {
      result[property][axis] = normalizeCurve(curves?.[property]?.[axis] ?? []);
    }
  }
  return result;
}
