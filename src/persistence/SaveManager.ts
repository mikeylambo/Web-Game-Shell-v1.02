import type { StorageAdapter } from "./StorageAdapter.js";

export interface SaveEnvelope<T>{schemaVersion:number;savedAt:string;data:T;}
export type VersionMigration=(data:unknown)=>unknown;
export type MigrationTable=Record<number,VersionMigration>;

export class SaveManager<T>{
  constructor(
    private readonly storage:StorageAdapter,
    private readonly key:string,
    private readonly schemaVersion:number,
    private readonly migrations:MigrationTable={}
  ){}
  async load():Promise<T|null>{
    const envelope=await this.storage.get<SaveEnvelope<unknown>>(this.key);
    if(!envelope)return null;
    if(envelope.schemaVersion>this.schemaVersion)throw new Error(`Save is newer than runtime: ${envelope.schemaVersion} > ${this.schemaVersion}`);
    let version=envelope.schemaVersion;let data=envelope.data;
    while(version<this.schemaVersion){
      const migrate=this.migrations[version];
      if(!migrate)throw new Error(`Missing save migration ${version} -> ${version+1}`);
      data=migrate(data);version++;
    }
    return data as T;
  }
  async save(data:T):Promise<void>{await this.storage.set(this.key,{schemaVersion:this.schemaVersion,savedAt:new Date().toISOString(),data} satisfies SaveEnvelope<T>);}
  async delete():Promise<void>{await this.storage.remove(this.key);}
}
