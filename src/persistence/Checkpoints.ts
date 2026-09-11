import { EventBus } from "../core/EventBus.js";

export interface Checkpoint<T=unknown>{id:string;createdAt:string;data:T;label?:string;}
export interface CheckpointEvents<T=unknown>{
  "checkpoint:saved":Checkpoint<T>;
  "checkpoint:loaded":Checkpoint<T>;
  [key:string]:unknown;
}

export class CheckpointManager<T=unknown>{
  readonly events=new EventBus<CheckpointEvents<T>>();
  private readonly checkpoints=new Map<string,Checkpoint<T>>();
  private latestId:string|null=null;

  save(id:string,data:T,label?:string):Checkpoint<T>{
    if(!id)throw new Error("Checkpoint requires an id");
    const checkpoint:Checkpoint<T>={id,createdAt:new Date().toISOString(),data:structuredClone(data),label};
    this.checkpoints.set(id,checkpoint);this.latestId=id;this.events.emit("checkpoint:saved",structuredClone(checkpoint));return structuredClone(checkpoint);
  }
  load(id:string):Checkpoint<T>|null{
    const checkpoint=this.checkpoints.get(id);if(!checkpoint)return null;
    this.events.emit("checkpoint:loaded",structuredClone(checkpoint));return structuredClone(checkpoint);
  }
  latest():Checkpoint<T>|null{return this.latestId?this.load(this.latestId):null;}
  has(id:string):boolean{return this.checkpoints.has(id);}
  remove(id:string):boolean{const removed=this.checkpoints.delete(id);if(this.latestId===id)this.latestId=null;return removed;}
  snapshot():Checkpoint<T>[]{return[...this.checkpoints.values()].map(item=>structuredClone(item));}
  hydrate(checkpoints:readonly Checkpoint<T>[]):void{
    this.checkpoints.clear();this.latestId=null;
    for(const checkpoint of checkpoints){this.checkpoints.set(checkpoint.id,structuredClone(checkpoint));this.latestId=checkpoint.id;}
  }
}
