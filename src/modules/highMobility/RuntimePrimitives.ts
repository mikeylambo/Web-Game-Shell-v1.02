import type { Vec3 } from "./BoostMotion.js";

export type RuntimeEventMap = Record<string, unknown>;
export type RuntimeEventListener<T> = (payload: T) => void;

export class RuntimeEventBus<Events extends RuntimeEventMap = RuntimeEventMap> {
  private listeners = new Map<keyof Events, Set<RuntimeEventListener<any>>>();

  on<K extends keyof Events>(event: K, listener: RuntimeEventListener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}

export class ObjectPool<T> {
  private free: T[] = [];
  private used = new Set<T>();

  constructor(
    private readonly create: () => T,
    private readonly reset: (item: T) => void = () => {},
    prewarm = 0
  ) {
    for (let i = 0; i < prewarm; i++) this.free.push(create());
  }

  acquire(): T {
    const item = this.free.pop() ?? this.create();
    this.used.add(item);
    return item;
  }

  release(item: T): boolean {
    if (!this.used.delete(item)) return false;
    this.reset(item);
    this.free.push(item);
    return true;
  }

  releaseAll(): void {
    for (const item of [...this.used]) this.release(item);
  }

  get activeCount(): number { return this.used.size; }
  get availableCount(): number { return this.free.length; }
}

export interface SpatialEntry {
  id: string;
  position: Vec3;
  radius?: number;
}

/** XZ spatial hash for broad-phase combat/world queries. */
export class SpatialHash<T extends SpatialEntry> {
  private cells = new Map<string, Set<T>>();
  private memberships = new Map<string, string[]>();

  constructor(public readonly cellSize = 64) {}

  upsert(entry: T): void {
    this.remove(entry.id);
    const radius = Math.max(0, entry.radius ?? 0);
    const minX = Math.floor((entry.position.x - radius) / this.cellSize);
    const maxX = Math.floor((entry.position.x + radius) / this.cellSize);
    const minZ = Math.floor((entry.position.z - radius) / this.cellSize);
    const maxZ = Math.floor((entry.position.z + radius) / this.cellSize);
    const keys: string[] = [];
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      const key = `${x}:${z}`;
      keys.push(key);
      let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, cell = new Set());
      cell.add(entry);
    }
    this.memberships.set(entry.id, keys);
  }

  remove(id: string): void {
    const keys = this.memberships.get(id);
    if (!keys) return;
    for (const key of keys) {
      const cell = this.cells.get(key);
      if (!cell) continue;
      for (const entry of cell) if (entry.id === id) cell.delete(entry);
      if (!cell.size) this.cells.delete(key);
    }
    this.memberships.delete(id);
  }

  queryRadius(position: Vec3, radius: number): T[] {
    const minX = Math.floor((position.x - radius) / this.cellSize);
    const maxX = Math.floor((position.x + radius) / this.cellSize);
    const minZ = Math.floor((position.z - radius) / this.cellSize);
    const maxZ = Math.floor((position.z + radius) / this.cellSize);
    const unique = new Map<string, T>();
    const r2 = radius * radius;
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      for (const entry of this.cells.get(`${x}:${z}`) ?? []) {
        const dx = entry.position.x - position.x;
        const dz = entry.position.z - position.z;
        const extent = entry.radius ?? 0;
        if (dx * dx + dz * dz <= (radius + extent) * (radius + extent) || dx * dx + dz * dz <= r2) unique.set(entry.id, entry);
      }
    }
    return [...unique.values()];
  }

  clear(): void {
    this.cells.clear();
    this.memberships.clear();
  }
}

export class HeightField {
  constructor(
    public readonly cellSize: number,
    private readonly sampleHeight: (gridX: number, gridZ: number) => number
  ) {}

  heightAt(x: number, z: number): number {
    const gx = x / this.cellSize;
    const gz = z / this.cellSize;
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const tx = gx - x0, tz = gz - z0;
    const h00 = this.sampleHeight(x0, z0);
    const h10 = this.sampleHeight(x0 + 1, z0);
    const h01 = this.sampleHeight(x0, z0 + 1);
    const h11 = this.sampleHeight(x0 + 1, z0 + 1);
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }
}

export interface PerformanceSnapshot {
  fps: number;
  frameMs: number;
  worstFrameMs: number;
  samples: number;
}

export class PerformanceSampler {
  private elapsed = 0;
  private frames = 0;
  private worst = 0;
  private current: PerformanceSnapshot = { fps: 0, frameMs: 0, worstFrameMs: 0, samples: 0 };

  sample(dtSeconds: number): PerformanceSnapshot | null {
    const dt = Math.max(0, dtSeconds);
    const ms = dt * 1000;
    this.elapsed += dt;
    this.frames++;
    this.worst = Math.max(this.worst, ms);
    if (this.elapsed < 0.5) return null;
    this.current = {
      fps: this.frames / this.elapsed,
      frameMs: this.elapsed * 1000 / this.frames,
      worstFrameMs: this.worst,
      samples: this.current.samples + 1
    };
    this.elapsed = 0;
    this.frames = 0;
    this.worst = 0;
    return this.snapshot();
  }

  snapshot(): PerformanceSnapshot {
    return { ...this.current };
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
