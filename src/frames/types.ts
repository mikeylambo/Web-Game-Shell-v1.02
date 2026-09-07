import type { ModeDefinition } from "../game/Modes.js";
import type { DifficultyProfile } from "../game/Difficulty.js";

export type FrameId =
  | "arcade"
  | "character-action"
  | "arena-combat"
  | "vehicle"
  | "fps"
  | "puzzle"
  | "rpg"
  | "strategy"
  | "survivor"
  | "platformer"
  | "party-multiplayer";

export type FlowPhase =
  | "boot"
  | "front"
  | "setup"
  | "play"
  | "post"
  | "utility";

export interface FlowStep {
  id: string;
  phase: FlowPhase;
  order?: number;
}

export interface GenreFrame {
  id: FrameId;
  label: string;
  menuFlow: FlowStep[];
  modes: ModeDefinition[];
  difficulties?: DifficultyProfile[];
  statKeys: string[];
  challengeCategories: string[];
  recommendedModules: string[];
  settings?: Record<string, unknown>;
}

export interface ComposedFrame {
  ids: FrameId[];
  menuFlow: string[];
  flowSteps: FlowStep[];
  modes: ModeDefinition[];
  difficulties: DifficultyProfile[];
  statKeys: string[];
  challengeCategories: string[];
  recommendedModules: string[];
  settings: Record<string, unknown>;
}

const phaseOrder: Record<FlowPhase, number> = {
  boot: 0,
  front: 100,
  setup: 200,
  play: 300,
  post: 400,
  utility: 500,
};

export function composeFrames(frames: GenreFrame[]): ComposedFrame {
  const ids = frames.map((frame) => frame.id);
  const flowSteps = [...new Map(frames.flatMap((frame) => frame.menuFlow).map((step) => [step.id, step])).values()]
    .sort((a, b) => (phaseOrder[a.phase] + (a.order ?? 0)) - (phaseOrder[b.phase] + (b.order ?? 0)));
  const menuFlow = flowSteps.map((step) => step.id);
  const modes = [...new Map(frames.flatMap((frame) => frame.modes).map((mode) => [mode.id, mode])).values()];
  const difficulties = [...new Map(frames.flatMap((frame) => frame.difficulties ?? []).map((profile) => [profile.id, profile])).values()];
  const statKeys = [...new Set(frames.flatMap((frame) => frame.statKeys))];
  const challengeCategories = [...new Set(frames.flatMap((frame) => frame.challengeCategories))];
  const recommendedModules = [...new Set(frames.flatMap((frame) => frame.recommendedModules))];
  const settings = Object.assign({}, ...frames.map((frame) => frame.settings ?? {}));
  return { ids, menuFlow, flowSteps, modes, difficulties, statKeys, challengeCategories, recommendedModules, settings };
}
