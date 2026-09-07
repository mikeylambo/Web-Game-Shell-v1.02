import type { Vec3 } from "./BoostMotion.js";

export interface TargetCandidate {
  id: string;
  position: Vec3;
  velocity?: Vec3;
  radius?: number;
  alive?: boolean;
  priority?: number;
}

export interface TargetSelectionTuning {
  maxRange: number;
  softLockCone: number;
  centerWeight: number;
  distanceWeight: number;
  priorityWeight: number;
}

export const DEFAULT_TARGET_SELECTION_TUNING: TargetSelectionTuning = {
  maxRange: 900,
  softLockCone: 0.72,
  centerWeight: 0.68,
  distanceWeight: 0.24,
  priorityWeight: 0.08
};

export interface BreakState {
  health: number;
  impact: number;
  maxImpact: number;
  brokenFor: number;
  recentHitFor: number;
}

export interface BreakTuning {
  breakDuration: number;
  vulnerableMultiplier: number;
  impactDecayPerSecond: number;
  impactDecayDelay: number;
}

export const DEFAULT_BREAK_TUNING: BreakTuning = {
  breakDuration: 2.25,
  vulnerableMultiplier: 1.6,
  impactDecayPerSecond: 145,
  impactDecayDelay: 1.8
};

export interface DamageResult {
  state: BreakState;
  damageApplied: number;
  broke: boolean;
}

/**
 * Pure targeting helpers. Consumers decide visibility/occlusion and provide only
 * candidates that are currently targetable. This keeps the shell independent
 * of any renderer, physics library or scene graph.
 */
export class TargetCombatController {
  hardLockId: string | null = null;

  constructor(
    public targetTuning: TargetSelectionTuning = { ...DEFAULT_TARGET_SELECTION_TUNING },
    public breakTuning: BreakTuning = { ...DEFAULT_BREAK_TUNING }
  ) {}

  chooseSoftTarget(origin: Vec3, forward: Vec3, candidates: TargetCandidate[]): TargetCandidate | null {
    const f = unit(forward);
    let best: TargetCandidate | null = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      if (candidate.alive === false) continue;
      const delta = sub(candidate.position, origin);
      const distance = length(delta);
      if (distance <= 0.001 || distance > this.targetTuning.maxRange) continue;
      const direction = scale(delta, 1 / distance);
      const alignment = dot(f, direction);
      if (alignment < this.targetTuning.softLockCone) continue;

      const centerScore = inverseLerp(this.targetTuning.softLockCone, 1, alignment);
      const distanceScore = 1 - distance / this.targetTuning.maxRange;
      const priorityScore = clamp(candidate.priority ?? 0, 0, 1);
      const score =
        centerScore * this.targetTuning.centerWeight +
        distanceScore * this.targetTuning.distanceWeight +
        priorityScore * this.targetTuning.priorityWeight;

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }

  setHardLock(candidate: TargetCandidate | null): string | null {
    this.hardLockId = candidate?.id ?? null;
    return this.hardLockId;
  }

  resolveHardLock(candidates: TargetCandidate[]): TargetCandidate | null {
    if (!this.hardLockId) return null;
    const target = candidates.find((candidate) => candidate.id === this.hardLockId && candidate.alive !== false) ?? null;
    if (!target) this.hardLockId = null;
    return target;
  }

  cycleHardLock(origin: Vec3, forward: Vec3, candidates: TargetCandidate[], direction = 1): TargetCandidate | null {
    const f = unit(forward);
    const valid = candidates
      .filter((candidate) => candidate.alive !== false && length(sub(candidate.position, origin)) <= this.targetTuning.maxRange)
      .sort((a, b) => signedYaw(f, unit(sub(a.position, origin))) - signedYaw(f, unit(sub(b.position, origin))));

    if (!valid.length) return this.setAndReturn(null);
    const current = valid.findIndex((candidate) => candidate.id === this.hardLockId);
    const next = current < 0 ? 0 : (current + Math.sign(direction || 1) + valid.length) % valid.length;
    return this.setAndReturn(valid[next] ?? null);
  }

  leadAim(origin: Vec3, target: TargetCandidate, projectileSpeed: number, maxLeadSeconds = 1.2): Vec3 {
    const velocity = target.velocity ?? { x: 0, y: 0, z: 0 };
    const distance = length(sub(target.position, origin));
    const leadTime = clamp(distance / Math.max(projectileSpeed, 1), 0, maxLeadSeconds);
    return add(target.position, scale(velocity, leadTime));
  }

  stepBreak(state: BreakState, dtSeconds: number): BreakState {
    const dt = clamp(dtSeconds, 0, 0.05);
    const next = { ...state };
    next.brokenFor = Math.max(0, next.brokenFor - dt);
    next.recentHitFor = Math.max(0, next.recentHitFor - dt);
    if (next.brokenFor <= 0 && next.recentHitFor <= 0) {
      next.impact = Math.max(0, next.impact - this.breakTuning.impactDecayPerSecond * dt);
    }
    return next;
  }

  applyDamage(state: BreakState, damage: number, impact: number): DamageResult {
    const next = { ...state };
    const vulnerable = next.brokenFor > 0;
    const damageApplied = Math.max(0, damage) * (vulnerable ? this.breakTuning.vulnerableMultiplier : 1);
    next.health = Math.max(0, next.health - damageApplied);
    next.recentHitFor = this.breakTuning.impactDecayDelay;

    let broke = false;
    if (!vulnerable && next.health > 0) {
      next.impact += Math.max(0, impact);
      if (next.impact >= next.maxImpact) {
        next.impact = 0;
        next.brokenFor = this.breakTuning.breakDuration;
        broke = true;
      }
    }

    return { state: next, damageApplied, broke };
  }

  private setAndReturn(candidate: TargetCandidate | null): TargetCandidate | null {
    this.setHardLock(candidate);
    return candidate;
  }
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (v: Vec3, amount: number): Vec3 => ({ x: v.x * amount, y: v.y * amount, z: v.z * amount });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (v: Vec3) => Math.sqrt(dot(v, v));
const unit = (v: Vec3): Vec3 => {
  const magnitude = length(v);
  return magnitude > 0.00001 ? scale(v, 1 / magnitude) : { x: 0, y: 0, z: -1 };
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const inverseLerp = (a: number, b: number, value: number) => clamp((value - a) / Math.max(0.00001, b - a), 0, 1);
const signedYaw = (forward: Vec3, target: Vec3) => Math.atan2(forward.x * target.z - forward.z * target.x, forward.x * target.x + forward.z * target.z);
