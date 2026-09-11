import { AchievementManager,type AchievementProvider } from "../game/Achievements.js";
import { NarrativeDirector } from "../narrative/NarrativeDirector.js";
import { CodexManager } from "../content/Codex.js";
import { EntitlementManager,type EntitlementState } from "../release/Entitlements.js";
import { CreditsRegistry } from "../release/Credits.js";
import { PhotoModeController } from "../photo/PhotoMode.js";
import { InputGlyphRegistry } from "../input/InputGlyphs.js";
import { CheckpointManager } from "../modules/checkpoints/CheckpointManager.js";
import { SubtitlePlayer } from "../presentation/Subtitles.js";
import { VoiceManifest } from "../presentation/VoiceManifest.js";
import { CinematicDirector } from "../presentation/Cinematics.js";
import { NotificationCenter } from "../presentation/Notifications.js";
import { TransitionManager } from "../presentation/Transitions.js";
import { CaptureService,type CaptureAdapter } from "../presentation/Capture.js";
import { OnboardingManager } from "../onboarding/OnboardingManager.js";

export interface ProductionServicesOptions {
  achievementProvider?:AchievementProvider;
  entitlement?:EntitlementState;
  captureAdapter?:CaptureAdapter;
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
  readonly subtitles=new SubtitlePlayer();
  readonly voice=new VoiceManifest();
  readonly cinematics=new CinematicDirector();
  readonly notifications=new NotificationCenter();
  readonly transitions=new TransitionManager();
  readonly onboarding=new OnboardingManager();
  readonly capture:CaptureService;

  constructor(options:ProductionServicesOptions={}){
    this.achievements=new AchievementManager(options.achievementProvider);
    this.entitlements=new EntitlementManager(options.entitlement??"full");
    this.capture=new CaptureService(options.captureAdapter);
  }
}
