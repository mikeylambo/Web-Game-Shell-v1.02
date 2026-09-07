export type TuningRecord = Record<string, number | boolean | string>;
export type TuningListener<T extends TuningRecord> = (snapshot: Readonly<T>, changedKey: keyof T) => void;

/**
 * Small renderer-neutral live tuning store. Consumers can bind sliders/debug UI
 * without letting debug presentation become authoritative game state.
 */
export class TuningStore<T extends TuningRecord> {
  private values: T;
  private listeners = new Set<TuningListener<T>>();

  constructor(initial: T) {
    this.values = structuredClone(initial);
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.values[key];
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    if (Object.is(this.values[key], value)) return;
    this.values[key] = value;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot, key);
  }

  patch(values: Partial<T>): void {
    for (const [key, value] of Object.entries(values) as [keyof T, T[keyof T]][]) {
      if (value !== undefined) this.set(key, value);
    }
  }

  snapshot(): Readonly<T> {
    return Object.freeze(structuredClone(this.values));
  }

  subscribe(listener: TuningListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
