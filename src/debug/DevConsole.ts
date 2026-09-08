export interface DevCommandContext{args:string[];raw:string;}
export interface DevCommand{description?:string;run:(context:DevCommandContext)=>void|Promise<void|string>|string;}

export class DevConsoleRegistry{
  private readonly commands=new Map<string,DevCommand>();
  register(name:string,command:DevCommand):()=>void{this.commands.set(name.trim().toLowerCase(),command);return()=>this.commands.delete(name.trim().toLowerCase());}
  list():readonly {name:string;description?:string}[]{return[...this.commands.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([name,command])=>({name,description:command.description}));}
  async execute(line:string):Promise<string|void>{
    const raw=line.trim();if(!raw)return;
    const [name,...args]=raw.split(/\s+/);const command=this.commands.get((name??"").toLowerCase());
    if(!command)throw new Error(`Unknown dev command: ${name}`);
    return await command.run({args,raw});
  }
}

export interface MountedDevConsole{dispose():void;show():void;hide():void;toggle():void;}

export function mountBrowserDevConsole(registry:DevConsoleRegistry,options:{hotkey?:string;title?:string}={}):MountedDevConsole{
  if(typeof document==="undefined"||typeof window==="undefined")return{dispose(){},show(){},hide(){},toggle(){}};
  const root=document.createElement("section");root.dataset.sluDevConsole="true";root.hidden=true;root.style.cssText="position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:rgba(4,8,12,.96);border:1px solid #4ddcff;color:#eaffff;font:12px/1.45 ui-monospace,monospace;padding:10px;max-height:45vh;box-shadow:0 12px 40px #0008";
  const head=document.createElement("div");head.textContent=options.title??"SLU DEV";head.style.cssText="font-weight:700;letter-spacing:.14em;margin-bottom:8px";
  const log=document.createElement("pre");log.style.cssText="white-space:pre-wrap;max-height:28vh;overflow:auto;margin:0 0 8px;color:#a9c8d4";
  const input=document.createElement("input");input.type="text";input.autocomplete="off";input.spellcheck=false;input.placeholder="command";input.style.cssText="width:100%;box-sizing:border-box;background:#08131c;color:white;border:1px solid #315266;padding:8px;font:inherit";
  root.append(head,log,input);document.body.append(root);
  const print=(text:string)=>{log.textContent=`${log.textContent??""}${text}\n`;log.scrollTop=log.scrollHeight;};
  const submit=async()=>{const line=input.value.trim();if(!line)return;print(`> ${line}`);input.value="";try{const result=await registry.execute(line);if(result)print(result);}catch(error){print(error instanceof Error?error.message:String(error));}};
  input.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();void submit();}});
  const hotkey=options.hotkey??"F1";const onKey=(event:KeyboardEvent)=>{if(event.key===hotkey){event.preventDefault();root.hidden=!root.hidden;if(!root.hidden)input.focus();}};window.addEventListener("keydown",onKey);
  return{dispose(){window.removeEventListener("keydown",onKey);root.remove();},show(){root.hidden=false;input.focus();},hide(){root.hidden=true;},toggle(){root.hidden=!root.hidden;if(!root.hidden)input.focus();}};
}
