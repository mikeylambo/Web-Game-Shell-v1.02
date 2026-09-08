import type { StorageAdapter } from "./StorageAdapter.js";
export interface SaveEnvelope<T> {
    schemaVersion: number;
    savedAt: string;
    data: T;
}
export type VersionMigration = (data: unknown) => unknown;
export type MigrationTable = Record<number, VersionMigration>;
export interface SaveRecoveryResult<T> {
    data: T | null;
    source: "primary" | "backup" | "empty";
    error?: Error;
}
export declare class SaveManager<T> {
    private readonly storage;
    private readonly key;
    private readonly schemaVersion;
    private readonly migrations;
    private readonly backupKey;
    constructor(storage: StorageAdapter, key: string, schemaVersion: number, migrations?: MigrationTable);
    private migrateEnvelope;
    load(): Promise<T | null>;
    loadWithRecovery(): Promise<SaveRecoveryResult<T>>;
    save(data: T): Promise<void>;
    restoreBackup(): Promise<boolean>;
    delete(): Promise<void>;
}
