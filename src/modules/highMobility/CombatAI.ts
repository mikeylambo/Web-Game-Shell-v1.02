import type { Vec3 } from "./BoostMotion.js";

export type HighMobilityAIState =
  | "idle"
  | "acquire"
  | "approach"
  | "strafe"
  | "attack"
  | "evade"
  | "recover"
  | "retreat"
  | "broken";

export interface EnemyArchetypeProfile {
  id: string;
  maxHealth: number;
  maxImpact: number;
  moveSpeed: number;
  preferredRange: number;
  rangeTolerance: number;
  aggression: number;
  evasion: number;
  canFly?: boolean;
}

export interface AIObservation {
  selfPosition: Vec3;
  targetPosition?: Vec3;
  distanceToTarget?: number;
  lineOfSight: boolean;
  incomingThreat: boolean;
  broken: boolean;
  healthFraction: number;
  attackReady: boolean;
}

export interface AICommand {
  state: HighMobilityAIState;
  move: "hold" | "approach" | "strafe" | "retreat" | "evade";
  attack: boolean;
}

/** Deterministic nine-state combat FSM. Rendering/nav implementation stays in the consumer. */
export class HighMobilityEnemyBrain {
  state: HighMobilityAIState = "idle";
  stateTime = 0;

  constructor(public readonly profile: EnemyArchetypeProfile) {}

  reset(): void {
    this.state = "idle";
    this.stateTime = 0;
  }

  step(observation: AIObservation, dtSeconds: number): AICommand {
    this.stateTime += Math.max(0, dtSeconds);

    if (observation.broken) return this.transition("broken", "hold", false);
    if (!observation.targetPosition) return this.transition("acquire", "hold", false);
    if (observation.incomingThreat && this.profile.evasion > 0.2) return this.transition("evade", "evade", false);
    if (observation.healthFraction < 0.2 && this.profile.aggression < 0.85) return this.transition("retreat", "retreat", false);

    const distance = observation.distanceToTarget ?? distanceXZ(observation.selfPosition, observation.targetPosition);
    const minRange = Math.max(0, this.profile.preferredRange - this.profile.rangeTolerance);
    const maxRange = this.profile.preferredRange + this.profile.rangeTolerance;

    if (!observation.lineOfSight) return this.transition("approach", "approach", false);
    if (distance > maxRange) return this.transition("approach", "approach", false);
    if (distance < minRange) return this.transition("retreat", "retreat", observation.attackReady && this.profile.aggression > 0.75);
    if (observation.attackReady) return this.transition("attack", "strafe", true);
    if (this.state === "attack" && this.stateTime < 0.35) return { state: "recover", move: "hold", attack: false };
    return this.transition("strafe", "strafe", false);
  }

  private transition(state: HighMobilityAIState, move: AICommand["move"], attack: boolean): AICommand {
    if (this.state !== state) {
      this.state = state;
      this.stateTime = 0;
    }
    return { state, move, attack };
  }
}

export const DEFAULT_MECH_ARCHETYPES: readonly EnemyArchetypeProfile[] = [
  { id: "skirmisher", maxHealth: 90, maxImpact: 70, moveSpeed: 66, preferredRange: 95, rangeTolerance: 36, aggression: 0.72, evasion: 0.62 },
  { id: "interceptor", maxHealth: 72, maxImpact: 55, moveSpeed: 92, preferredRange: 58, rangeTolerance: 24, aggression: 0.88, evasion: 0.9, canFly: true },
  { id: "gunner", maxHealth: 110, maxImpact: 90, moveSpeed: 48, preferredRange: 180, rangeTolerance: 55, aggression: 0.58, evasion: 0.38 },
  { id: "bulwark", maxHealth: 260, maxImpact: 180, moveSpeed: 31, preferredRange: 78, rangeTolerance: 28, aggression: 0.92, evasion: 0.12 },
  { id: "missile-carrier", maxHealth: 145, maxImpact: 115, moveSpeed: 43, preferredRange: 240, rangeTolerance: 70, aggression: 0.64, evasion: 0.3, canFly: true }
] as const;

const distanceXZ = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
