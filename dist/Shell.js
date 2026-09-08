import { EventBus } from "./core/EventBus.js";
import { GameSession } from "./core/GameSession.js";
import { InputManager } from "./input/InputManager.js";
import { ModeManager } from "./game/Modes.js";
import { ObjectiveManager } from "./game/Objectives.js";
import { ChallengeManager } from "./game/Challenges.js";
import { DifficultyManager } from "./game/Difficulty.js";
import { RewardManager } from "./game/Rewards.js";
import { UnlockManager } from "./game/UnlockManager.js";
import { StatsManager } from "./game/StatsManager.js";
import { ContentRegistry } from "./content/ContentRegistry.js";
import { StudioServices } from "./studio/StudioServices.js";
export class SLUWebShell {
    options;
    events = new EventBus();
    session = new GameSession();
    input = new InputManager();
    modes = new ModeManager();
    objectives = new ObjectiveManager();
    challenges = new ChallengeManager();
    difficulty = new DifficultyManager();
    rewards = new RewardManager();
    unlocks;
    stats;
    content = new ContentRegistry();
    studio;
    lastLevelId = null;
    constructor(options) {
        this.options = options;
        this.unlocks = options.unlocks ?? new UnlockManager();
        this.stats = options.stats ?? new StatsManager();
        this.studio = new StudioServices(options.build, options.studio);
        this.session.events.on("phase:changed", ({ from, to }) => this.studio.telemetry.record("session.phase", { from, to }));
        this.session.events.on("session:ended", ({ durationMs }) => this.studio.telemetry.record("session.end", { durationMs }));
        this.studio.dev.register("state.phase", { description: "Show active game phase", run: () => this.session.phase });
        this.studio.dev.register("state.build", { description: "Show build metadata", run: () => JSON.stringify(this.build, null, 2) });
        this.studio.dev.register("state.level", { description: "Show last loaded level id", run: () => this.lastLevelId ?? "none" });
        this.studio.dev.register("state.settings", { description: "Show active settings snapshot", run: () => JSON.stringify(this.settings.snapshot(), null, 2) });
        this.studio.dev.register("game.pause", { description: "Pause active gameplay", run: () => this.pause() });
        this.studio.dev.register("game.resume", { description: "Resume paused gameplay", run: () => this.resume() });
        this.studio.dev.register("game.restart", { description: "Emit the game restart request", run: () => this.restart() });
        this.studio.dev.register("game.quit", { description: "Return the shell to menu state", run: () => this.quit() });
        this.studio.dev.register("level.load", { description: "Load a level by id", run: async ({ args }) => { const id = args[0]; if (!id)
                throw new Error("Usage: level.load <id>"); await this.loadLevel(id); return `loaded ${id}`; } });
        this.studio.dev.registerPanel("State", { description: "Shell, build, settings and level state", read: () => ({ phase: this.session.phase, levelId: this.lastLevelId, build: this.build, settings: this.settings.snapshot() }) });
        this.studio.dev.registerPanel("Input", { description: "Semantic input actions", read: () => Object.fromEntries(this.input.actions().map(action => [action, this.input.get(action)])) });
    }
    get build() { return this.options.build; }
    get renderer() { return this.options.renderer; }
    get settings() { return this.options.settings; }
    async boot() {
        this.session.start();
        this.studio.start();
        try {
            this.session.setPhase("title");
            await this.renderer.start?.();
        }
        catch (error) {
            this.fail("boot", error);
            throw error;
        }
    }
    pause() { const before = this.session.phase; this.session.pause(); if (this.session.phase === before)
        return; this.renderer.suspend?.(); this.studio.telemetry.record("game.pause"); this.events.emit("game:pause", undefined); }
    resume() { const before = this.session.phase; this.session.resume(); if (this.session.phase === before)
        return; this.renderer.resume?.(); this.studio.telemetry.record("game.resume"); this.events.emit("game:resume", undefined); }
    async loadLevel(id, payload) {
        this.lastLevelId = id;
        this.session.setPhase("loading");
        this.studio.telemetry.record("level.load", { levelId: id });
        this.events.emit("level:load", { id, payload });
        try {
            await this.renderer.loadLevel?.(id, payload);
            this.session.setPhase("playing");
            this.studio.telemetry.record("level.loaded", { levelId: id });
            this.events.emit("level:loaded", { id });
        }
        catch (error) {
            this.fail("level.load", error, { levelId: id });
            throw error;
        }
    }
    restart() { this.studio.telemetry.record("game.restart", this.lastLevelId ? { levelId: this.lastLevelId } : {}); this.events.emit("game:restart", undefined); }
    quit() {
        this.studio.telemetry.record("game.quit", this.lastLevelId ? { levelId: this.lastLevelId } : {});
        this.events.emit("game:quit", undefined);
        this.session.setPhase("menu");
        try {
            const pending = this.renderer.unloadLevel?.();
            if (pending instanceof Promise)
                void pending.catch(error => this.fail("level.unload", error));
        }
        catch (error) {
            this.fail("level.unload", error);
        }
        this.lastLevelId = null;
    }
    async dispose() { this.session.end(); this.studio.stop(); await this.renderer.dispose?.(); }
    fail(scope, error, context = {}) {
        this.studio.diagnostics.capture(error, { scope, ...context });
        this.studio.telemetry.record("runtime.error", { scope, message: error instanceof Error ? error.message : String(error), ...context });
        try {
            this.session.setPhase("error");
        }
        catch { /* preserve the original failure */ }
        this.events.emit("game:error", { scope, error });
    }
}
