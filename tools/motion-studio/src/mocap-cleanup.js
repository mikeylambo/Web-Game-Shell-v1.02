const EPS = 1e-8;

export function distance3(a, b) {
  const dx = (a[0] ?? 0) - (b[0] ?? 0);
  const dy = (a[1] ?? 0) - (b[1] ?? 0);
  const dz = (a[2] ?? 0) - (b[2] ?? 0);
  return Math.hypot(dx, dy, dz);
}

export function velocitySamples(samples = []) {
  return samples.map((sample, index) => {
    if (index === 0) return { time: sample.time, speed: 0 };
    const prev = samples[index - 1];
    const dt = Math.max(EPS, sample.time - prev.time);
    return { time: sample.time, speed: distance3(sample.position, prev.position) / dt };
  });
}

export function solveFloorHeight(footTracks = [], percentile = 0.08) {
  const heights = footTracks
    .flatMap((track) => track.map((sample) => sample.position?.[1]))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!heights.length) return 0;
  const index = Math.max(0, Math.min(heights.length - 1, Math.floor(heights.length * percentile)));
  return heights[index];
}

export function detectFootContacts(samples = [], options = {}) {
  const speedThreshold = options.speedThreshold ?? 0.12;
  const heightThreshold = options.heightThreshold ?? 0.055;
  const minimumDuration = options.minimumDuration ?? 0.08;
  const floorHeight = options.floorHeight ?? solveFloorHeight([samples]);
  const velocities = velocitySamples(samples);
  const active = samples.map((sample, i) => ({
    time: sample.time,
    position: sample.position,
    contact: velocities[i].speed <= speedThreshold && Math.abs(sample.position[1] - floorHeight) <= heightThreshold,
    speed: velocities[i].speed,
  }));

  const windows = [];
  let start = -1;
  for (let i = 0; i <= active.length; i++) {
    const on = i < active.length && active[i].contact;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      const end = i - 1;
      const duration = active[end].time - active[start].time;
      if (duration >= minimumDuration) {
        const anchor = active.slice(start, end + 1).reduce((sum, sample) => [
          sum[0] + sample.position[0], sum[1] + sample.position[1], sum[2] + sample.position[2]
        ], [0,0,0]).map(v => v / (end - start + 1));
        windows.push({ startTime: active[start].time, endTime: active[end].time, anchor, sampleStart:start, sampleEnd:end });
      }
      start = -1;
    }
  }
  return { floorHeight, windows, samples: active };
}

export function contactWeight(time, window, blendSeconds = 0.04) {
  if (time < window.startTime - blendSeconds || time > window.endTime + blendSeconds) return 0;
  if (time >= window.startTime && time <= window.endTime) return 1;
  if (time < window.startTime) return Math.max(0, 1 - (window.startTime - time) / Math.max(EPS, blendSeconds));
  return Math.max(0, 1 - (time - window.endTime) / Math.max(EPS, blendSeconds));
}

export function footLockCorrection(sample, windows, options = {}) {
  const blendSeconds = options.blendSeconds ?? 0.04;
  let weight = 0;
  let anchor = null;
  for (const window of windows) {
    const w = contactWeight(sample.time, window, blendSeconds);
    if (w > weight) { weight = w; anchor = window.anchor; }
  }
  if (!anchor || weight <= 0) return { ...sample, correction:[0,0,0], weight:0 };
  const correction = [
    (anchor[0] - sample.position[0]) * weight,
    (anchor[1] - sample.position[1]) * weight,
    (anchor[2] - sample.position[2]) * weight,
  ];
  return { ...sample, correction, weight };
}

export function detectPositionOutliers(samples = [], multiplier = 4.5) {
  if (samples.length < 4) return [];
  const velocities = velocitySamples(samples).map(v => v.speed).slice(1);
  const sorted = [...velocities].sort((a,b)=>a-b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const deviations = velocities.map(v => Math.abs(v - median)).sort((a,b)=>a-b);
  const mad = deviations[Math.floor(deviations.length / 2)] || EPS;
  const threshold = median + multiplier * mad;
  return velocities.map((speed, i) => ({ index:i+1, time:samples[i+1].time, speed })).filter(v => v.speed > threshold);
}

export function stabilizeRootPath(samples = [], options = {}) {
  if (!samples.length) return [];
  const strength = Math.max(0, Math.min(1, options.strength ?? 0.65));
  const preserveVertical = options.preserveVertical ?? true;
  const radius = Math.max(1, Math.floor(options.radius ?? 2));
  return samples.map((sample, i) => {
    let count = 0, avg = [0,0,0];
    for (let j = Math.max(0, i-radius); j <= Math.min(samples.length-1, i+radius); j++) {
      avg[0] += samples[j].position[0]; avg[1] += samples[j].position[1]; avg[2] += samples[j].position[2]; count++;
    }
    avg = avg.map(v => v / count);
    const position = [
      sample.position[0] + (avg[0]-sample.position[0])*strength,
      preserveVertical ? sample.position[1] : sample.position[1] + (avg[1]-sample.position[1])*strength,
      sample.position[2] + (avg[2]-sample.position[2])*strength,
    ];
    return { ...sample, position };
  });
}

export function buildCleanupReport({ leftFoot = [], rightFoot = [], root = [] } = {}, options = {}) {
  const floorHeight = solveFloorHeight([leftFoot, rightFoot]);
  const left = detectFootContacts(leftFoot, { ...options, floorHeight });
  const right = detectFootContacts(rightFoot, { ...options, floorHeight });
  return {
    floorHeight,
    leftContacts: left.windows,
    rightContacts: right.windows,
    rootOutliers: detectPositionOutliers(root),
    rootSampleCount: root.length,
    recommendations: [
      ...(left.windows.length || right.windows.length ? ['apply foot-lock correction layer'] : ['no stable foot contacts detected; verify thresholds']),
      ...(detectPositionOutliers(root).length ? ['repair root outliers before smoothing'] : []),
      'stabilize horizontal root drift while preserving intentional vertical motion',
    ],
  };
}
