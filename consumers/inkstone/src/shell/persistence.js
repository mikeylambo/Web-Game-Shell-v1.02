import { SaveManager, SettingsStore } from '@slu/web-shell';
import { KEYS } from '../storage.js';

const COMPAT_SAVE_KEY = 'compat-save';
const COMPAT_SAVE_SCHEMA = 1;

/** Raw Inkstone keys that must survive the V0.5 persistence handoff. */
export const COMPAT_KEYS = Object.freeze([
  KEYS.profile,
  KEYS.bindings,
  KEYS.editorMode,
  KEYS.board,
  KEYS.options,
]);

function isJsonString(raw) {
  if (raw == null) return true;
  if (typeof raw !== 'string') return false;
  try { JSON.parse(raw); return true; } catch { return false; }
}

function parseJson(raw, fallback = null) {
  if (!isJsonString(raw) || raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

/**
 * The Shell envelope is only healthy if the Inkstone payloads inside it are
 * healthy too. This prevents a syntactically-valid envelope from blessing a
 * corrupt legacy profile/options/bindings blob.
 */
export function validateCompatibilitySnapshot(value) {
  const invalid = [];
  if (!value || typeof value !== 'object') return { ok: false, invalid: ['snapshot'] };
  if (value.version !== COMPAT_SAVE_SCHEMA) invalid.push('version');
  if (!value.keys || typeof value.keys !== 'object') invalid.push('keys');

  if (value.keys && typeof value.keys === 'object') {
    for (const key of COMPAT_KEYS) {
      const raw = Object.prototype.hasOwnProperty.call(value.keys, key) ? value.keys[key] : null;
      if (raw !== null && !isJsonString(raw)) invalid.push(key);
    }
  }

  return { ok: invalid.length === 0, invalid };
}

export class InkstonePersistenceBridge {
  constructor({
    storage,
    coreSettings = null,
    legacyStorage = null,
    onEvent = null,
    onError = null,
  } = {}) {
    if (!storage) throw new Error('InkstonePersistenceBridge requires Shell storage.');
    this.storage = storage;
    this.coreSettings = coreSettings;
    this.legacyStorage = legacyStorage || window.localStorage;
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.onError = typeof onError === 'function' ? onError : () => {};
    this.saveManager = new SaveManager(storage, COMPAT_SAVE_KEY, COMPAT_SAVE_SCHEMA);
    this.playerSettings = new SettingsStore(storage, 'player-options', {});
    this.lastRecovery = { source: 'empty', restored: [], invalidLegacy: [] };
    this.queue = Promise.resolve();
  }

  raw(key) {
    try { return this.legacyStorage.getItem(key); } catch { return null; }
  }

  capture() {
    const keys = {};
    for (const key of COMPAT_KEYS) keys[key] = this.raw(key);
    return {
      version: COMPAT_SAVE_SCHEMA,
      capturedAt: new Date().toISOString(),
      keys,
    };
  }

  legacyHealth() {
    const invalid = [];
    for (const key of COMPAT_KEYS) {
      const raw = this.raw(key);
      if (raw !== null && !isJsonString(raw)) invalid.push(key);
    }
    return { ok: invalid.length === 0, invalid };
  }

  async loadValidatedRecovery() {
    let result;
    try {
      result = await this.saveManager.loadWithRecovery();
    } catch (error) {
      this.onError('load', error);
      result = { data: null, source: 'empty', error };
    }

    if (result.data && validateCompatibilitySnapshot(result.data).ok) {
      // SaveManager.loadWithRecovery returns backup data when primary migration
      // fails, but does not promote it. Promote first so the next save cannot
      // rotate the corrupt primary over the last known-good backup.
      if (result.source === 'backup') await this.saveManager.restoreBackup();
      return result;
    }

    // BrowserStorage deliberately returns null for malformed JSON, so the
    // SaveManager cannot distinguish an absent primary from an unreadable one.
    // Inspect the backup envelope directly and validate its inner payload.
    try {
      const backup = await this.storage.get(`${COMPAT_SAVE_KEY}:backup`);
      if (backup && backup.schemaVersion === COMPAT_SAVE_SCHEMA &&
          validateCompatibilitySnapshot(backup.data).ok) {
        await this.saveManager.restoreBackup();
        return { data: backup.data, source: 'backup', error: result.error };
      }
    } catch (error) {
      this.onError('backup-load', error);
    }

    return { data: null, source: 'empty', error: result.error };
  }

  applyRecovery(snapshot, { all = false } = {}) {
    if (!snapshot || !validateCompatibilitySnapshot(snapshot).ok) return [];
    const restored = [];

    for (const key of COMPAT_KEYS) {
      const safeRaw = snapshot.keys[key];
      if (safeRaw == null || !isJsonString(safeRaw)) continue;
      const current = this.raw(key);
      const needsRestore = all || current == null || !isJsonString(current);
      if (!needsRestore) continue;
      try {
        this.legacyStorage.setItem(key, safeRaw);
        restored.push(key);
      } catch (error) {
        this.onError('legacy-restore', error);
      }
    }
    return restored;
  }

  async mirrorLegacyOptions() {
    const options = parseJson(this.raw(KEYS.options), null);
    if (!options || typeof options !== 'object' || Array.isArray(options)) return false;

    await this.playerSettings.patch({ ...options });
    const corePatch = {};
    if (Number.isFinite(options.volMaster)) corePatch.masterVolume = options.volMaster;
    if (Number.isFinite(options.volMusic)) corePatch.musicVolume = options.volMusic;
    if (Number.isFinite(options.volSfx)) corePatch.sfxVolume = options.volSfx;
    if (Number.isFinite(options.shake)) corePatch.screenShake = options.shake;
    if (this.coreSettings && Object.keys(corePatch).length) await this.coreSettings.patch(corePatch);

    this.onEvent('settings.sync', {
      inkstoneKeys: Object.keys(options).length,
      coreKeys: Object.keys(corePatch),
    });
    return true;
  }

  async boot() {
    await this.playerSettings.load();
    const recovery = await this.loadValidatedRecovery();
    const before = this.legacyHealth();
    const restored = recovery.data ? this.applyRecovery(recovery.data) : [];
    const after = this.legacyHealth();

    this.lastRecovery = {
      source: recovery.source,
      restored,
      invalidLegacy: before.invalid,
      healthyAfter: after.ok,
    };

    this.onEvent('persistence.recovery', this.lastRecovery);
    await this.mirrorLegacyOptions();
    await this.saveNow('boot', { mirrorOptions: false });
    return this.lastRecovery;
  }

  async saveNow(reason = 'unspecified', { mirrorOptions = true } = {}) {
    const snapshot = this.capture();
    const health = validateCompatibilitySnapshot(snapshot);
    if (!health.ok) {
      const error = new Error(`Refusing to snapshot corrupt Inkstone storage: ${health.invalid.join(', ')}`);
      this.onError('snapshot-refused', error);
      this.onEvent('persistence.snapshot-refused', { reason, invalid: health.invalid });
      return false;
    }
    if (mirrorOptions) await this.mirrorLegacyOptions();
    await this.saveManager.save(snapshot);
    this.onEvent('persistence.snapshot', { reason, keys: COMPAT_KEYS.length });
    return true;
  }

  queueSnapshot(reason = 'unspecified') {
    this.queue = this.queue
      .then(() => this.saveNow(reason))
      .catch((error) => {
        this.onError('snapshot', error);
        return false;
      });
    return this.queue;
  }

  async syncPlayerSettings(options = {}) {
    const clean = options && typeof options === 'object' ? { ...options } : {};
    await this.playerSettings.patch(clean);

    // Mirror only exact semantic matches into CoreSettings. Inkstone-specific
    // controls remain in the dedicated player-options store.
    const corePatch = {};
    if (Number.isFinite(clean.volMaster)) corePatch.masterVolume = clean.volMaster;
    if (Number.isFinite(clean.volMusic)) corePatch.musicVolume = clean.volMusic;
    if (Number.isFinite(clean.volSfx)) corePatch.sfxVolume = clean.volSfx;
    if (Number.isFinite(clean.shake)) corePatch.screenShake = clean.shake;
    if (this.coreSettings && Object.keys(corePatch).length) await this.coreSettings.patch(corePatch);

    this.onEvent('settings.sync', {
      inkstoneKeys: Object.keys(clean).length,
      coreKeys: Object.keys(corePatch),
    });
    return this.queueSnapshot('player-options');
  }

  async restoreBackup() {
    const backup = await this.storage.get(`${COMPAT_SAVE_KEY}:backup`);
    if (!backup || backup.schemaVersion !== COMPAT_SAVE_SCHEMA) return false;
    if (!validateCompatibilitySnapshot(backup.data).ok) return false;
    await this.saveManager.restoreBackup();
    const restored = this.applyRecovery(backup.data, { all: true });
    await this.mirrorLegacyOptions();
    this.lastRecovery = { source: 'backup', restored, invalidLegacy: [], healthyAfter: true };
    this.onEvent('persistence.manual-restore', { restored });
    return true;
  }

  status() {
    return {
      compatibilityKeys: [...COMPAT_KEYS],
      lastRecovery: { ...this.lastRecovery },
      playerSettings: this.playerSettings.snapshot(),
    };
  }
}
