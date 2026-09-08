export class SaveManager {
    storage;
    key;
    schemaVersion;
    migrations;
    backupKey;
    constructor(storage, key, schemaVersion, migrations = {}) {
        this.storage = storage;
        this.key = key;
        this.schemaVersion = schemaVersion;
        this.migrations = migrations;
        this.backupKey = `${key}:backup`;
    }
    migrateEnvelope(envelope) {
        if (envelope.schemaVersion > this.schemaVersion)
            throw new Error(`Save is newer than runtime: ${envelope.schemaVersion} > ${this.schemaVersion}`);
        let version = envelope.schemaVersion;
        let data = envelope.data;
        while (version < this.schemaVersion) {
            const migrate = this.migrations[version];
            if (!migrate)
                throw new Error(`Missing save migration ${version} -> ${version + 1}`);
            data = migrate(data);
            version++;
        }
        return data;
    }
    async load() { const envelope = await this.storage.get(this.key); return envelope ? this.migrateEnvelope(envelope) : null; }
    async loadWithRecovery() {
        try {
            const data = await this.load();
            return { data, source: data === null ? "empty" : "primary" };
        }
        catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));
            const backup = await this.storage.get(this.backupKey);
            if (!backup)
                return { data: null, source: "empty", error: normalized };
            try {
                return { data: this.migrateEnvelope(backup), source: "backup", error: normalized };
            }
            catch {
                return { data: null, source: "empty", error: normalized };
            }
        }
    }
    async save(data) {
        const previous = await this.storage.get(this.key);
        if (previous)
            await this.storage.set(this.backupKey, previous);
        await this.storage.set(this.key, { schemaVersion: this.schemaVersion, savedAt: new Date().toISOString(), data });
    }
    async restoreBackup() { const backup = await this.storage.get(this.backupKey); if (!backup)
        return false; this.migrateEnvelope(backup); await this.storage.set(this.key, backup); return true; }
    async delete() { await this.storage.remove(this.key); await this.storage.remove(this.backupKey); }
}
