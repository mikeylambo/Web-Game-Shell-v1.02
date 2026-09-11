export interface VersionedSave<T=unknown>{schemaVersion:number;data:T;}
export type SaveMigration=(data:unknown)=>unknown;

export class SaveMigrationRegistry {
  private readonly migrations=new Map<number,SaveMigration>();
  constructor(readonly currentVersion:number){if(currentVersion<1)throw new Error("currentVersion must be >= 1");}

  register(fromVersion:number,migration:SaveMigration):this{
    if(fromVersion<1||fromVersion>=this.currentVersion)throw new Error(`Invalid migration source version: ${fromVersion}`);
    if(this.migrations.has(fromVersion))throw new Error(`Migration already registered for v${fromVersion}`);
    this.migrations.set(fromVersion,migration);return this;
  }

  migrate<T=unknown>(save:VersionedSave):VersionedSave<T>{
    if(!Number.isInteger(save.schemaVersion)||save.schemaVersion<1)throw new Error("Invalid save schema version");
    if(save.schemaVersion>this.currentVersion)throw new Error(`Save v${save.schemaVersion} is newer than supported v${this.currentVersion}`);
    let version=save.schemaVersion;
    let data=structuredClone(save.data);
    while(version<this.currentVersion){
      const migration=this.migrations.get(version);
      if(!migration)throw new Error(`Missing save migration v${version} -> v${version+1}`);
      data=migration(data);version++;
    }
    return{schemaVersion:this.currentVersion,data:data as T};
  }

  canMigrate(fromVersion:number):boolean{
    if(fromVersion<1||fromVersion>this.currentVersion)return false;
    for(let version=fromVersion;version<this.currentVersion;version++)if(!this.migrations.has(version))return false;
    return true;
  }
}
