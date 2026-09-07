export type ImpactSignificance = "chaff" | "normal" | "critical" | "boss" | "cinematic";

export interface ImpactVector3 {
  x: number;
  y: number;
  z: number;
}

export interface ImpactSpawnContext {
  sourceId?: string;
  targetId?: string;
  position?: ImpactVector3;
  direction?: ImpactVector3;
  seed?: number;
  significance?: ImpactSignificance;
  tags?: string[];
}

export interface ImpactCue {
  id: string;
  at: number;
  channel: "vfx" | "audio" | "camera" | "rumble" | "ui" | "gameplay";
  payload?: Record<string, unknown>;
}

export interface ImpactRecipe {
  id: string;
  duration: number;
  cues: ImpactCue[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ImpactRuntimeAdapter {
  play(recipe: ImpactRecipe, context?: ImpactSpawnContext): string;
  stop(instanceId: string): void;
  update?(deltaSeconds: number): void;
}
