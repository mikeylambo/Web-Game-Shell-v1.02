import { EventBus } from "./core/EventBus.js";
import { GameSession } from "./core/GameSession.js";
import type { BuildInfo } from "./core/types.js";
import { InputManager } from "./input/InputManager.js";
import { ModeManager } from "./game/Modes.js";
import { ObjectiveManager } from "./game/Objectives.js";
import { ChallengeManager } from "./game/Challenges.js";
import { DifficultyManager } from "./game/Difficulty.js";
import { RewardManager } from "./game/Rewards.js";
import { UnlockManager } from "./game/UnlockManager.js";
import { StatsManager } from "./game/StatsManager.js";
import { ContentRegistry } from "./content/ContentRegistry.js";
import type { RendererAdapter } from "./adapters/RendererAdapter.js";
import type { SettingsStore } from "./persistence/SettingsStore.js";
import { StudioServices, type StudioServicesOptions } from "./studio/StudioServices.js";

export interface ShellEvents {
  "game:pause":undefined;"game:resume":undefined;"game:restart":undefined;"game:quit":undefined;
  "level:load":{id:string;payload?:unknown};"level:loaded":{id:string};[key:string]:unknown;
}
export interface ShellOptions<TSettings extends object>{
  build:BuildInfo;renderer:RendererAdapter;settings:SettingsStore<TSettings>;unlocks?:UnlockManager;stats?:StatsManager;studio?:StudioServicesOptions;
}
export class SLUWebShell<TSettings extends object>{
  readonly events=new EventBus<ShellEvents>();readonly session=new GameSession();readonly input=new InputManager();
  readonly modes=new ModeManager();readonly objectives=new ObjectiveManager();readonly challenges=new ChallengeManager();
  readonly difficulty=new DifficultyManager();readonly rewards=new RewardManager();readonly unlocks:UnlockManager;
  readonly stats:StatsManager;readonly content=new ContentRegistry();readonly studio:StudioServices;
  constructor(readonly options:ShellOptions<TSettings>){this.unlocks=options.unlocks??new UnlockManager();this.stats=options.stats??new StatsManager();this.studio=new StudioServices(options.build,options.studio);}
  get build():BuildInfo{return this.options.build;} get renderer():RendererAdapter{return this.options.renderer;}
  get settings():SettingsStore<TSettings>{return this.options.settings;}
  async boot():Promise<void>{this.session.start();this.session.setPhase("title");this.studio.start();await this.renderer.start?.();}
  pause():void{this.session.pause();this.renderer.suspend?.();this.studio.telemetry.record("game.pause");this.events.emit("game:pause",undefined);}
  resume():void{this.session.resume();this.renderer.resume?.();this.studio.telemetry.record("game.resume");this.events.emit("game:resume",undefined);}
  async loadLevel(id:string,payload?:unknown):Promise<void>{this.session.setPhase("loading");this.studio.telemetry.record("level.load",{levelId:id});this.events.emit("level:load",{id,payload});await this.renderer.loadLevel?.(id,payload);this.session.setPhase("playing");this.studio.telemetry.record("level.loaded",{levelId:id});this.events.emit("level:loaded",{id});}
  restart():void{this.studio.telemetry.record("game.restart");this.events.emit("game:restart",undefined);}
  quit():void{this.studio.telemetry.record("game.quit");this.events.emit("game:quit",undefined);this.session.setPhase("menu");}
}
