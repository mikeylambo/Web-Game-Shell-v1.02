import type { StorageAdapter } from "./StorageAdapter.js";

export interface SaveEnvelope<T>{schemaVersion:number;savedAt:string;data:T;}
export type VersionMigration=(data:unknown)=>unknown;
export type MigrationTable=Record<number,VersionMigration>;
export interface SaveRecoveryResult<T>{data:T|null;source:"primary"|"backup"|"empty";error?:Error;}

export class SaveManager<T>{
  private readonly backupKey:string;
  constructor(
    private readonly storage:StorageAdapter,
    private readonly key:string,
    private readonly schemaVersion:number,
    private readonly migrations:MigrationTable={}
  ){this.backupKey=`${key}:backup`;}
  private migrateEnvelope(envelope:SaveEnvelope<unknown>):T{
    if(envelope.schemaVersion>this.schemaVersion)throw new Error(`Save is newer than runtime: ${envelope.schemaVersion} > ${this.schemaVersion}`);
    let version=envelope.schemaVersion;let data=envelope.data;
    while(version<this.schemaVersion){
      const migrate=this.migrations[version];
      if(!migrate)throw new Error(`Missing save migration ${version} -> ${version+1}`);
      data=migrate(data);version++;
    }
    return data as T;
  }
  async load():Promise<T|null>{const envelope=await this.storage.get<SaveEnvelope<unknown>>(this.key);return envelope?this.migrateEnvelope(envelope):null;}
  async loadWithRecovery():Promise<SaveRecoveryResult<T>>{
    try{const data=await this.load();return{data,source:data===null?"empty":"primary"};}
    catch(error){const normalized=error instanceof Error?error:new Error(String(error));const backup=await this.storage.get<SaveEnvelope<unknown>>(this.backupKey);if(!backup)return{data:null,source:"empty",error:normalized};try{return{data:this.migrateEnvelope(backup),source:"backup",error:normalized};}catch{return{data:null,source:"empty",error:normalized};}}
  }
  async save(data:T):Promise<void>{
    const previous=await this.storage.get<SaveEnvelope<unknown>>(this.key);
    if(previous)await this.storage.set(this.backupKey,previous);
    await this.storage.set(this.key,{schemaVersion:this.schemaVersion,savedAt:new Date().toISOString(),data} satisfies SaveEnvelope<T>);
  }
  async restoreBackup():Promise<boolean>{const backup=await this.storage.get<SaveEnvelope<unknown>>(this.backupKey);if(!backup)return false;this.migrateEnvelope(backup);await this.storage.set(this.key,backup);return true;}
  async delete():Promise<void>{await this.storage.remove(this.key);await this.storage.remove(this.backupKey);}
}
