import type { ImpactSpawnContext } from "../impact/types.js";
import type { MotionImpactBridge } from "./MotionImpactBridge.js";
import type { MotionClip, MotionPlayOptions } from "./types.js";

export interface MotionPlayerHooks {
  onMarker?(instanceId: string, clip: MotionClip, markerId: string): void;
  onComplete?(instanceId: string, clip: MotionClip): void;
  onTime?(instanceId: string, clip: MotionClip, timeSeconds: number): void;
}

interface ActiveMotion {
  id: string;
  entityId: string;
  clip: MotionClip;
  options: MotionPlayOptions;
  time: number;
  speed: number;
  playing: boolean;
  context?: ImpactSpawnContext;
}

let nextId = 1;

export class MotionPlayer {
  private readonly active = new Map<string, ActiveMotion>();

  constructor(
    private readonly bridge?: MotionImpactBridge,
    private readonly hooks: MotionPlayerHooks = {},
  ) {}

  play(entityId: string, clip: MotionClip, options: MotionPlayOptions = {}, context?: ImpactSpawnContext): string {
    const id = `motion:${nextId++}`;
    const time = Math.max(0, Math.min(options.startTime ?? 0, clip.duration));
    this.active.set(id, {
      id,
      entityId,
      clip: structuredClone(clip),
      options: { ...options },
      time,
      speed: options.speed ?? 1,
      playing: true,
      context,
    });
    this.bridge?.reset(id);
    return id;
  }

  stop(instanceId: string): void {
    this.active.delete(instanceId);
    this.bridge?.reset(instanceId);
  }

  setSpeed(instanceId: string, speed: number): void {
    const state = this.active.get(instanceId);
    if (state) state.speed = Number.isFinite(speed) ? speed : 1;
  }

  seek(instanceId: string, timeSeconds: number): void {
    const state = this.active.get(instanceId);
    if (!state) return;
    state.time = Math.max(0, Math.min(timeSeconds, state.clip.duration));
    this.bridge?.reset(instanceId);
    this.hooks.onTime?.(instanceId, state.clip, state.time);
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    for (const state of [...this.active.values()]) {
      if (!state.playing) continue;
      const previous = state.time;
      const next = previous + deltaSeconds * state.speed;
      const loop = state.options.loop ?? state.clip.loop ?? false;

      if (next <= state.clip.duration) {
        state.time = next;
        const fired = this.bridge?.update(state.id, state.clip, previous, state.time, state.context) ?? [];
        for (const marker of fired) this.hooks.onMarker?.(state.id, state.clip, marker.id);
        this.hooks.onTime?.(state.id, state.clip, state.time);
        continue;
      }

      if (loop && state.clip.duration > 0) {
        this.bridge?.update(state.id, state.clip, previous, state.clip.duration, state.context);
        const wrapped = next % state.clip.duration;
        state.time = wrapped;
        this.bridge?.reset(state.id);
        const fired = this.bridge?.update(state.id, state.clip, 0, wrapped, state.context) ?? [];
        for (const marker of fired) this.hooks.onMarker?.(state.id, state.clip, marker.id);
        this.hooks.onTime?.(state.id, state.clip, state.time);
      } else {
        state.time = state.clip.duration;
        this.bridge?.update(state.id, state.clip, previous, state.time, state.context);
        this.hooks.onTime?.(state.id, state.clip, state.time);
        this.hooks.onComplete?.(state.id, state.clip);
        this.stop(state.id);
      }
    }
  }

  getTime(instanceId: string): number | undefined {
    return this.active.get(instanceId)?.time;
  }

  getActiveCount(): number {
    return this.active.size;
  }
}
