import type { GenreFrame } from "./types.js";
import { flow } from "./types.js";

/**
 * Survivor / bullet-heaven frame.
 *
 * Intentionally keeps the shell opinionated about the run loop while leaving
 * combat, rendering, enemies, upgrades and mutations to Game DNA.
 */
export const survivorFrame = (): GenreFrame => ({
  id: "survivor",
  label: "Survivor / Bullet Heaven",
  menuFlow: [
    ...flow("boot", "title"),
    ...flow("front", "main-menu"),
    ...flow("setup", "mode-select", "character-select"),
    ...flow("play", "playing"),
    ...flow("post", "results")
  ],
  modes: [
    { id: "survival", label: "Survival", leaderboardKey: "survivalTime" },
    { id: "endless", label: "Endless", leaderboardKey: "score" },
    { id: "rush", label: "Rush", leaderboardKey: "score" }
  ],
  difficulties: [
    { id: "normal", label: "Normal" },
    { id: "hard", label: "Hard", multipliers: { enemySpeed: 1.1, score: 1.15 } }
  ],
  statKeys: [
    "runs",
    "wins",
    "bestScore",
    "bestSurvivalTime",
    "highestLevel",
    "kills",
    "bossKills",
    "damageDealt",
    "damageTaken",
    "playTimeMs"
  ],
  challengeCategories: ["survival", "kills", "build", "boss", "mastery"],
  recommendedModules: ["leaderboards", "replays", "ranking", "quick-retry"],
  settings: { quickRetry: true }
});
