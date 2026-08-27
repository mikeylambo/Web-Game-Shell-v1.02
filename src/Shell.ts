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

export interface ShellEvents {
  "game:pause":undefined;"game:resume":undefined;"game:restart":undefined;"game:quit":undefined;
  "level:load":{id:string;payload?:unknown};"level:loaded":{id:string};[key:string]:unknown;
}
export interface ShellOptions<TSettings extends object>{
  build:BuildInfo;renderer:RendererAdapter;settings:SettingsStore<TSettings>;unlocks?:UnlockManager;stats?:StatsManager;
}
export class SLUWebShell<TSettings extends object>{
  readonly events=new EventBus<ShellEvents>();readonly session=new GameSession();readonly input=new InputManager();
  readonly modes=new ModeManager();readonly objectives=new ObjectiveManager();readonly challenges=new ChallengeManager();
  readonly difficulty=new DifficultyManager();readonly rewards=new RewardManager();readonly unlocks:UnlockManager;
  readonly stats:StatsManager;readonly content=new ContentRegistry();
  constructor(readonly options:ShellOptions<TSettings>){this.unlocks=options.unlocks??new UnlockManager();this.stats=options.stats??new StatsManager();}
  get build():BuildInfo{return this.options.build;} get renderer():RendererAdapter{return this.options.renderer;}
  get settings():SettingsStore<TSettings>{return this.options.settings;}
  async boot():Promise<void>{this.session.start();this.session.setPhase("title");await this.renderer.start?.();}
  pause():void{this.session.pause();this.renderer.suspend?.();this.events.emit("game:pause",undefined);}
  resume():void{this.session.resume();this.renderer.resume?.();this.events.emit("game:resume",undefined);}
  async loadLevel(id:string,payload?:unknown):Promise<void>{this.session.setPhase("loading");this.events.emit("level:load",{id,payload});await this.renderer.loadLevel?.(id,payload);this.session.setPhase("playing");this.events.emit("level:loaded",{id});}
  restart():void{this.events.emit("game:restart",undefined);} quit():void{this.events.emit("game:quit",undefined);this.session.setPhase("menu");}
}
