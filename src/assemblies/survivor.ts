import { moduleHandle } from "./helpers.js";
import type { FrameAssembly, FrameAssemblyContext } from "./types.js";
import {
  RankingSystem,
  ResultsManager,
  LeaderboardManager,
  ReplayRecorder,
  RulesetManager
} from "../modules/index.js";
import { survivorFrame } from "../frames/survivor.js";

/** Turnkey shell assembly for survivor / bullet-heaven games. */
export function createSurvivorAssembly(context: FrameAssemblyContext): FrameAssembly {
  const frame = survivorFrame();
  const ranking = RankingSystem.letterGrades();
  const modules = [
    moduleHandle("ranking", ranking),
    moduleHandle("results", new ResultsManager(ranking)),
    moduleHandle("leaderboards", new LeaderboardManager()),
    moduleHandle("replay", new ReplayRecorder()),
    moduleHandle("rulesets", new RulesetManager())
  ];

  return {
    id: frame.id,
    frame,
    modules,
    install() {
      context.shell.modes.register(frame.modes);
      if (frame.difficulties) context.shell.difficulty.register(frame.difficulties);
    }
  };
}
