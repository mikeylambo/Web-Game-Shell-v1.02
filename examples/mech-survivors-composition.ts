import { composeFrames, highMobilityCombatFrame, survivorFrame } from "../src/frames/index.js";
import {
  BoostMotionController,
  TargetCombatController,
  type BoostMotionTuning
} from "../src/modules/index.js";

/**
 * First consumer for the reusable high-mobility combat work.
 *
 * This intentionally contains no borrowed ASHFALL/IRONVEIL source, assets,
 * shaders, naming or tuning tables. It composes our own shell layers and uses
 * original starting values that are expected to move during feel testing.
 */
export const mechSurvivorsFrame = () =>
  composeFrames(survivorFrame(), highMobilityCombatFrame());

export const MECH_SURVIVORS_MOTION: BoostMotionTuning = {
  moveSpeed: 70,
  acceleration: 18,
  airAcceleration: 11,
  burstSpeed: 205,
  burstDuration: 0.18,
  burstCost: 16,
  burstCooldown: 0.27,
  overdriveSpeed: 230,
  overdriveDrainPerSecond: 8,
  liftSpeed: 92,
  liftDrainPerSecond: 13,
  descendSpeed: 145,
  groundEnergyRegenPerSecond: 46,
  airEnergyRegenPerSecond: 20,
  energyRegenDelay: 0.45,
  maxEnergy: 100
};

export const createMechSurvivorsControllers = () => ({
  motion: new BoostMotionController({ ...MECH_SURVIVORS_MOTION }),
  combat: new TargetCombatController(
    {
      maxRange: 700,
      softLockCone: 0.66,
      centerWeight: 0.54,
      distanceWeight: 0.34,
      priorityWeight: 0.12
    },
    {
      breakDuration: 1.35,
      vulnerableMultiplier: 1.45,
      impactDecayPerSecond: 190,
      impactDecayDelay: 1.2
    }
  )
});

export type MechUpgradeId =
  | "twin-rack"
  | "vector-capacitor"
  | "reactor-bleed"
  | "blade-array"
  | "target-lattice"
  | "drone-bay"
  | "impact-driver"
  | "overdrive-core";

export interface MechUpgradeDefinition {
  id: MechUpgradeId;
  label: string;
  shortEffect: string;
  family: "weapon" | "mobility" | "reactor" | "targeting" | "support";
  maxRank: number;
}

/** Initial prototype bank: readable effects first, spectacle later. */
export const MECH_SURVIVORS_UPGRADES: readonly MechUpgradeDefinition[] = [
  { id: "twin-rack", label: "Twin Rack", shortEffect: "+1 missile volley", family: "weapon", maxRank: 4 },
  { id: "vector-capacitor", label: "Vector Capacitor", shortEffect: "+1 burst charge", family: "mobility", maxRank: 3 },
  { id: "reactor-bleed", label: "Reactor Bleed", shortEffect: "+20% EN regen", family: "reactor", maxRank: 5 },
  { id: "blade-array", label: "Blade Array", shortEffect: "+1 orbiting cutter", family: "weapon", maxRank: 5 },
  { id: "target-lattice", label: "Target Lattice", shortEffect: "+1 auto-target", family: "targeting", maxRank: 4 },
  { id: "drone-bay", label: "Drone Bay", shortEffect: "+1 wing drone", family: "support", maxRank: 4 },
  { id: "impact-driver", label: "Impact Driver", shortEffect: "+25% break impact", family: "weapon", maxRank: 5 },
  { id: "overdrive-core", label: "Overdrive Core", shortEffect: "Kills extend overdrive", family: "reactor", maxRank: 3 }
];

export const MECH_SURVIVORS_PROTOTYPE = {
  runSeconds: 600,
  bossAtSeconds: 540,
  upgradeChoices: 3,
  startingWeapons: ["rifle", "blade"],
  enemyArchetypes: ["chaser", "gunner", "missile", "heavy", "interceptor"],
  simultaneousEnemyTarget: 100,
  designQuestion: "Does high-authority boost movement remain readable and fun under survivor-scale threat density?"
} as const;
