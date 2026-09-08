import assert from 'node:assert/strict';
import { InkstonePersistenceBridge, validateCompatibilitySnapshot } from '../src/shell/persistence.js';
import { KEYS } from '../src/storage.js';

class MemoryAdapter {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.has(key) ? structuredClone(this.map.get(key)) : null; }
  async set(key, value) { this.map.set(key, structuredClone(value)); }
  async remove(key) { this.map.delete(key); }
  async clear() { this.map.clear(); }
}

class LegacyStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

const profileA = JSON.stringify({ version: 2, totalRuns: 3, bests: {} });
const profileB = JSON.stringify({ version: 2, totalRuns: 4, bests: {} });
const options = JSON.stringify({ volMaster: 0.75, volMusic: 0.5, volSfx: 0.8, shake: 0.4 });

assert.equal(validateCompatibilitySnapshot({ version: 1, keys: { [KEYS.profile]: profileA } }).ok, true);
assert.equal(validateCompatibilitySnapshot({ version: 1, keys: { [KEYS.profile]: '{bad' } }).ok, false);

const shellStorage = new MemoryAdapter();
const legacy = new LegacyStorage({
  [KEYS.profile]: profileA,
  [KEYS.options]: options,
});
const corePatches = [];
const coreSettings = { async patch(value) { corePatches.push({ ...value }); } };

const first = new InkstonePersistenceBridge({ storage: shellStorage, legacyStorage: legacy, coreSettings });
const firstRecovery = await first.boot();
assert.equal(firstRecovery.healthyAfter, true);
assert.equal(first.status().playerSettings.volMaster, 0.75);
assert.deepEqual(corePatches.at(-1), {
  masterVolume: 0.75,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  screenShake: 0.4,
});

legacy.setItem(KEYS.profile, profileB);
assert.equal(await first.saveNow('new-profile'), true);
assert.ok(await shellStorage.get('compat-save:backup'), 'backup-before-write should exist');

legacy.setItem(KEYS.profile, '{corrupt');
assert.equal(await first.saveNow('corrupt-profile'), false, 'corrupt compatibility data must never replace the safe save');

const recoveredPrimary = new InkstonePersistenceBridge({ storage: shellStorage, legacyStorage: legacy, coreSettings });
const primaryReport = await recoveredPrimary.boot();
assert.equal(primaryReport.source, 'primary');
assert.ok(primaryReport.restored.includes(KEYS.profile));
assert.equal(legacy.getItem(KEYS.profile), profileB, 'valid primary snapshot repairs corrupt legacy profile');

// Force the Shell primary envelope itself to be incompatible. SaveManager must
// fall back to its previous backup, and Inkstone must reapply that older data.
await shellStorage.set('compat-save', { schemaVersion: 999, savedAt: new Date().toISOString(), data: {} });
legacy.setItem(KEYS.profile, '{corrupt-again');
const recoveredBackup = new InkstonePersistenceBridge({ storage: shellStorage, legacyStorage: legacy, coreSettings });
const backupReport = await recoveredBackup.boot();
assert.equal(backupReport.source, 'backup');
assert.ok(backupReport.restored.includes(KEYS.profile));
assert.equal(legacy.getItem(KEYS.profile), profileB, 'validated backup repairs legacy storage when primary envelope is rejected');

// A manual restore is explicit and may replace currently-valid compatibility
// keys with the last validated backup.
legacy.setItem(KEYS.profile, JSON.stringify({ version: 2, totalRuns: 99, bests: {} }));
assert.equal(await recoveredBackup.restoreBackup(), true);
assert.notEqual(JSON.parse(legacy.getItem(KEYS.profile)).totalRuns, 99);

console.log('INKSTONE PERSISTENCE CONTRACT PASS — backup, recovery, payload validation and settings mirroring verified.');
