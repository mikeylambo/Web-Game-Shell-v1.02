import type { RendererAdapter } from '../RendererAdapter.js';
/** Renderer-neutral lifecycle bridge: the consumer owns its Pixi application. */
export class PixiAdapter implements RendererAdapter {
  readonly id = 'pixi';
  constructor(private readonly hooks: Omit<RendererAdapter, 'id'>) {}
  start() { return this.hooks.start?.(); }
  suspend() { this.hooks.suspend?.(); }
  resume() { this.hooks.resume?.(); }
  resize(w: number, h: number, dpr: number) { this.hooks.resize?.(w, h, dpr); }
  loadLevel(id: string, payload?: unknown) { return this.hooks.loadLevel?.(id, payload); }
  unloadLevel() { return this.hooks.unloadLevel?.(); }
  screenshot() { return this.hooks.screenshot?.() ?? Promise.resolve(null); }
  dispose() { return this.hooks.dispose?.(); }
}
