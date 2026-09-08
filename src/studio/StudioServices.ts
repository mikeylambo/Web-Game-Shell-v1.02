import type { BuildInfo, JsonValue } from "../core/types.js";
import { TelemetryRecorder } from "../telemetry/Telemetry.js";
import { RuntimeDiagnostics } from "../diagnostics/RuntimeDiagnostics.js";
import { DevConsoleRegistry } from "../debug/DevConsole.js";
import { LocalizationRegistry } from "../localization/Localization.js";
import { AssetManifest } from "../assets/AssetManifest.js";
import { createNoopPlatformServices, type PlatformServices } from "../platform/PlatformServices.js";

export interface StudioServicesOptions{platform?:PlatformServices;locale?:string;telemetryContext?:Record<string,JsonValue>;installGlobalDiagnostics?:boolean;}

export class StudioServices{
  readonly telemetry:TelemetryRecorder;
  readonly diagnostics:RuntimeDiagnostics;
  readonly dev=new DevConsoleRegistry();
  readonly localization:LocalizationRegistry;
  readonly assets=new AssetManifest();
  readonly platform:PlatformServices;
  private stopDiagnostics:(()=>void)|null=null;
  constructor(readonly build:BuildInfo,private readonly options:StudioServicesOptions={}){
    this.telemetry=new TelemetryRecorder({context:{gameId:build.gameId,version:build.version,...(options.telemetryContext??{})}});
    this.diagnostics=new RuntimeDiagnostics(build);
    this.localization=new LocalizationRegistry({defaultLocale:options.locale??"en",fallbackLocale:options.locale??"en"});
    this.platform=options.platform??createNoopPlatformServices();
    this.dev.register("help",{description:"List registered commands",run:()=>this.dev.list().map(item=>`${item.name}${item.description?` — ${item.description}`:""}`).join("\n")});
    this.dev.register("telemetry.count",{description:"Show local telemetry event count",run:()=>String(this.telemetry.snapshot().length)});
    this.dev.register("diagnostics.count",{description:"Show diagnostic entry count",run:()=>String(this.diagnostics.snapshot().length)});
  }
  start():void{if(this.options.installGlobalDiagnostics!==false&&!this.stopDiagnostics)this.stopDiagnostics=this.diagnostics.installGlobalHandlers();this.telemetry.record("shell.boot");}
  stop():void{this.stopDiagnostics?.();this.stopDiagnostics=null;this.telemetry.record("shell.stop");}
}
