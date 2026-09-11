import { AchievementManager,type AchievementProvider } from "../game/Achievements.js";
import { NarrativeDirector } from "../narrative/NarrativeDirector.js";
import { CodexManager } from "../content/Codex.js";
import { EntitlementManager,type EntitlementState } from "../release/Entitlements.js";
import { CreditsRegistry } from "../release/Credits.js";
import { PhotoModeController } from "../photo/PhotoMode.js";
import { InputGlyphRegistry } from "../input/InputGlyphs.js";
import { CheckpointManager } from "../persistence/Checkpoints.js";

export interface ProductionServicesOptions {
  achievementProvider?:AchievementProvider;
  entitlement?:EntitlementState;
}

/** High-level game production services that are deliberately renderer-neutral.
 * Individual games may ignore any service they do not need. */
export class ProductionServices {
  readonly achievements:AchievementManager;
  readonly narrative=new NarrativeDirector();
  readonly codex=new CodexManager();
  readonly entitlements:EntitlementManager;
  readonly credits=new CreditsRegistry();
  readonly photo=new PhotoModeController();
  readonly glyphs=new InputGlyphRegistry();
  readonly checkpoints=new CheckpointManager<unknown>();

  constructor(options:ProductionServicesOptions={}){
    this.achievements=new AchievementManager(options.achievementProvider);
    this.entitlements=new EntitlementManager(options.entitlement??"full");
  }
}
