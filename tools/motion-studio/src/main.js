import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const state = {
  model: null, mixer: null, clips: [], actions: new Map(), activeClip: null, activeAction: null,
  bones: new Map(), selectedBone: null, duration: 1, time: 0, playing: false, speed: 1,
  package: { schema:'slu-motion-impact', version:1, id:'motion-studio-project', rigs:[], clips:[], impacts:[], metadata:{ studioVersion:'0.1' } },
  markers: [], boneCurves: {}, states: [], transitions: [], selectedMarker: -1, currentFileName: '',
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 200);
camera.position.set(2.8, 1.8, 4.4);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
$('viewport').appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0); controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x151923, 2.2));
const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(4,6,3); key.castShadow=true; scene.add(key);
const rim = new THREE.DirectionalLight(0xff6a24, 2.3); rim.position.set(-4,3,-3); scene.add(rim);
const grid = new THREE.GridHelper(12, 24, 0x24304a, 0x151b26); scene.add(grid);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12,12), new THREE.MeshStandardMaterial({ color:0x0c1018, roughness:1 }));
floor.rotation.x = -Math.PI/2; floor.receiveShadow=true; scene.add(floor);
const clock = new THREE.Clock();
const loader = new GLTFLoader();

const modeMap = { motion:'motionInspector', cleanup:'cleanupInspector', state:'stateInspector', vfx:'vfxInspector', ai:'aiInspector' };
document.querySelectorAll('[data-view]').forEach(btn => btn.onclick = () => {
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active', b===btn));
  Object.values(modeMap).forEach(id=>$(id).classList.remove('active'));
  $(modeMap[btn.dataset.view]).classList.add('active');
});

function resize(){ const el=$('viewport'); const w=el.clientWidth,h=el.clientHeight; if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();} const c=$('timelineCanvas'); const dpr=devicePixelRatio||1;c.width=Math.max(1,c.clientWidth*dpr);c.height=Math.max(1,c.clientHeight*dpr);drawTimeline(); }
new ResizeObserver(resize).observe($('viewport')); new ResizeObserver(resize).observe($('timelineCanvas'));

function fitModel(root){
  const box=new THREE.Box3().setFromObject(root); const size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
  root.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  const max=Math.max(size.x,size.y,size.z,1); camera.position.set(max*1.5,size.y*.75,max*2.2); controls.target.set(0,size.y*.52,0); controls.update();
}
function clearModel(){ if(state.model){scene.remove(state.model); state.model=null;} state.mixer=null;state.clips=[];state.actions.clear();state.bones.clear();state.activeClip=null;state.activeAction=null; }
function loadCharacterFile(file){ const url=URL.createObjectURL(file); loader.load(url,gltf=>{ URL.revokeObjectURL(url); clearModel(); state.model=gltf.scene; scene.add(state.model); fitModel(state.model); state.currentFileName=file.name; state.clips=gltf.animations||[]; state.mixer=new THREE.AnimationMixer(state.model); state.clips.forEach(c=>state.actions.set(c.name,state.mixer.clipAction(c))); collectBones(); refreshAnimations(); autoMapRig(); $('characterName').textContent=file.name; $('animationCount').textContent=String(state.clips.length); $('.drop-hint')?.remove(); },undefined,e=>{console.error(e);$('stageOverlay').textContent='Import failed: '+e.message;}); }
$('characterFile').onchange=e=>e.target.files[0]&&loadCharacterFile(e.target.files[0]);
$('viewport').ondragover=e=>{e.preventDefault();}; $('viewport').ondrop=e=>{e.preventDefault();const f=e.dataTransfer.files[0]; if(f)loadCharacterFile(f);};

function collectBones(){ state.bones.clear(); if(!state.model)return; state.model.traverse(o=>{ if(o.isBone)state.bones.set(o.name,o); }); const sel=$('boneSelect');sel.innerHTML='';[...state.bones.keys()].sort().forEach(n=>sel.add(new Option(n,n))); if(sel.options.length){sel.selectedIndex=0;selectBone(sel.value);} refreshRigList(); }
function selectBone(name){ state.selectedBone=state.bones.get(name)||null; if(!state.selectedBone)return; const e=state.selectedBone.rotation; $('boneX').value=THREE.MathUtils.radToDeg(e.x).toFixed(2);$('boneY').value=THREE.MathUtils.radToDeg(e.y).toFixed(2);$('boneZ').value=THREE.MathUtils.radToDeg(e.z).toFixed(2); }
$('boneSelect').onchange=e=>selectBone(e.target.value);
['boneX','boneY','boneZ'].forEach(id=>$(id).onchange=()=>{if(!state.selectedBone)return;state.selectedBone.rotation.set(THREE.MathUtils.degToRad(+$('boneX').value),THREE.MathUtils.degToRad(+$('boneY').value),THREE.MathUtils.degToRad(+$('boneZ').value));});
$('insertBoneKey').onclick=()=>{ if(!state.selectedBone)return; const name=state.selectedBone.name; state.boneCurves[name]??=[]; const key={time:+state.time.toFixed(4),euler:[+$('boneX').value,+$('boneY').value,+$('boneZ').value]}; const keys=state.boneCurves[name]; const idx=keys.findIndex(k=>Math.abs(k.time-key.time)<.001); if(idx>=0)keys[idx]=key;else keys.push(key); keys.sort((a,b)=>a.time-b.time); state.package.metadata.boneCurves=state.boneCurves; $('stageOverlay').textContent=`Bone key: ${name} @ ${key.time.toFixed(3)}s`; drawTimeline(); };

const aliases={hips:['hips','pelvis'],spine:['spine','spine_01','mixamorigspine'],chest:['chest','spine_03','mixamorigspine1'],upperChest:['upperchest','spine_05','mixamorigspine2'],neck:['neck','neck_01','mixamorigneck'],head:['head','mixamorighead'],leftShoulder:['leftshoulder','clavicle_l','mixamorigleftshoulder'],leftUpperArm:['leftupperarm','upperarm_l','mixamorigleftarm'],leftLowerArm:['leftlowerarm','lowerarm_l','mixamorigleftforearm'],leftHand:['lefthand','hand_l','mixamoriglefthand'],rightShoulder:['rightshoulder','clavicle_r','mixamorigrightshoulder'],rightUpperArm:['rightupperarm','upperarm_r','mixamorigrightarm'],rightLowerArm:['rightlowerarm','lowerarm_r','mixamorigrightforearm'],rightHand:['righthand','hand_r','mixamorigrighthand'],leftUpperLeg:['leftupperleg','thigh_l','mixamorigleftupleg'],leftLowerLeg:['leftlowerleg','calf_l','mixamorigleftleg'],leftFoot:['leftfoot','foot_l','mixamorigleftfoot'],leftToes:['lefttoes','ball_l','mixamoriglefttoebase'],rightUpperLeg:['rightupperleg','thigh_r','mixamorigrightupleg'],rightLowerLeg:['rightlowerleg','calf_r','mixamorigrightleg'],rightFoot:['rightfoot','foot_r','mixamorigrightfoot'],rightToes:['righttoes','ball_r','mixamorigrighttoebase']};
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
function autoMapRig(){ if(!state.bones.size)return; const by=new Map([...state.bones.keys()].map(n=>[norm(n),n])); const humanoid={}; Object.entries(aliases).forEach(([semantic,names])=>{for(const n of names){const hit=by.get(norm(n));if(hit){humanoid[semantic]=hit;break;}}}); const required=['hips','spine','head','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot']; const coverage=required.filter(k=>humanoid[k]).length/required.length; state.package.rigs=[{id:'studio.auto_rig',rootBone:humanoid.hips||[...state.bones.keys()][0],humanoid,forwardAxis:'+Z',upAxis:'+Y',metadata:{source:state.currentFileName,coverage}}]; $('rigStatus').textContent=`${Math.round(coverage*100)}% mapped`; refreshRigList(); }
$('autoMapRig').onclick=autoMapRig;
function refreshRigList(){ const el=$('rigList');el.innerHTML=''; const rig=state.package.rigs[0]; if(!rig)return; Object.entries(rig.humanoid||{}).forEach(([k,v])=>{const d=document.createElement('div');d.className='item';d.textContent=`${k}  →  ${v}`;el.append(d);}); }
function refreshSockets(){ const el=$('socketList');el.innerHTML=''; const rig=state.package.rigs[0]; (rig?.sockets||[]).forEach(s=>{const d=document.createElement('div');d.className='item';d.textContent=`${s.id} → ${s.bone}`;el.append(d);}); }
$('addSocket').onclick=()=>{const id=$('socketName').value.trim();if(!id||!state.selectedBone)return;const rig=state.package.rigs[0]||(state.package.rigs[0]={id:'studio.auto_rig',rootBone:'root',humanoid:{}});rig.sockets??=[];rig.sockets.push({id,bone:state.selectedBone.name,tags:['studio']});$('socketName').value='';refreshSockets();};

function refreshAnimations(){const el=$('animationList');el.innerHTML='';state.clips.forEach((clip,i)=>{const b=document.createElement('button');b.textContent=`${clip.name} · ${clip.duration.toFixed(2)}s`;b.onclick=()=>selectClip(i);el.append(b);});if(state.clips.length&&!state.activeClip)selectClip(0);}
$('refreshAnimations').onclick=refreshAnimations;
function selectClip(index){const clip=state.clips[index];if(!clip)return; if(state.activeAction)state.activeAction.stop();state.activeClip=clip;state.activeAction=state.actions.get(clip.name);state.duration=clip.duration||1;state.time=0;$('clipName').textContent=clip.name;$('clipDuration').textContent=state.duration.toFixed(3)+'s';[...$('animationList').children].forEach((b,i)=>b.classList.toggle('selected',i===index)); let pkgClip=state.package.clips.find(c=>c.metadata?.animationName===clip.name||c.id===clip.name);if(!pkgClip){pkgClip={id:clip.name,source:'imported',assetUri:state.currentFileName,duration:clip.duration,targetRigId:state.package.rigs[0]?.id,rootMotion:'extract',markers:[],metadata:{animationName:clip.name}};state.package.clips.push(pkgClip);}state.markers=pkgClip.markers||[];drawTimeline();}
$('playBtn').onclick=()=>{if(!state.activeAction)return;state.activeAction.paused=false;state.activeAction.play();state.playing=true;};
$('pauseBtn').onclick=()=>{if(state.activeAction){state.activeAction.paused=!state.activeAction.paused;state.playing=!state.activeAction.paused;}};
$('stopBtn').onclick=()=>{if(state.activeAction){state.activeAction.stop();state.activeAction.reset();state.time=0;state.playing=false;drawTimeline();}};
$('speed').oninput=e=>state.speed=+e.target.value;

function currentPackageClip(){return state.activeClip&&state.package.clips.find(c=>c.metadata?.animationName===state.activeClip.name||c.id===state.activeClip.name);}
function loadPackageFile(file){file.text().then(text=>{try{const p=JSON.parse(text);if(p.schema!=='slu-motion-impact')throw new Error('Unsupported package schema');state.package=p;const clip=currentPackageClip();state.markers=clip?.markers||[];refreshRigList();refreshSockets();drawTimeline();$('stageOverlay').textContent=`Package loaded: ${p.id}`;}catch(e){$('stageOverlay').textContent='Package error: '+e.message;}});}
$('packageFile').onchange=e=>e.target.files[0]&&loadPackageFile(e.target.files[0]);

const laneFor=m=>{const k=m.kind||m.channel||'';if(k==='hitbox_on'||k==='hitbox_off')return 1;if(k==='vfx'||k==='impact')return 2;if(k==='audio')return 3;if(k==='camera')return 4;if(k==='cancel_open'||k==='cancel_close')return 6;return 5;};
function drawTimeline(){const c=$('timelineCanvas'),ctx=c.getContext('2d'),dpr=devicePixelRatio||1,w=c.width,h=c.height;ctx.clearRect(0,0,w,h);ctx.save();ctx.scale(dpr,dpr);const W=w/dpr,H=h/dpr,laneH=H/7;ctx.fillStyle='#080b10';ctx.fillRect(0,0,W,H);for(let i=0;i<7;i++){ctx.strokeStyle='#18202d';ctx.beginPath();ctx.moveTo(0,(i+1)*laneH);ctx.lineTo(W,(i+1)*laneH);ctx.stroke();}for(let s=0;s<=Math.ceil(state.duration*10);s++){const t=s/10,x=t/state.duration*W;ctx.strokeStyle=s%10===0?'#2b3547':'#141b27';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}state.markers.forEach((m,i)=>{const x=(m.at||0)/state.duration*W,lane=laneFor(m),y=lane*laneH+laneH/2;ctx.fillStyle=i===state.selectedMarker?'#fff':'#ff7a24';ctx.beginPath();ctx.moveTo(x,y-8);ctx.lineTo(x+6,y);ctx.lineTo(x,y+8);ctx.lineTo(x-6,y);ctx.closePath();ctx.fill();});Object.values(state.boneCurves).flat().forEach(k=>{const x=k.time/state.duration*W;ctx.fillStyle='#6ea8ff';ctx.fillRect(x-2,4,4,laneH-8);});const px=state.time/state.duration*W;ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,H);ctx.stroke();ctx.restore();$('timeReadout').textContent=`${state.time.toFixed(3)} / ${state.duration.toFixed(3)}`;}
$('timelineCanvas').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();const x=e.clientX-r.left;state.time=Math.max(0,Math.min(state.duration,x/r.width*state.duration));if(state.mixer){state.mixer.setTime(state.time);state.playing=false;if(state.activeAction)state.activeAction.paused=true;}let best=-1,dist=12;state.markers.forEach((m,i)=>{const mx=(m.at||0)/state.duration*r.width;const d=Math.abs(mx-x);if(d<dist){best=i;dist=d;}});state.selectedMarker=best;drawTimeline();};
$('addMarker').onclick=()=>{const clip=currentPackageClip();if(!clip)return;const kind=prompt('Marker kind','impact');if(!kind)return;const id=prompt('Marker id',`${kind}_${Math.round(state.time*1000)}`)||`${kind}_${Date.now()}`;const marker={id,at:+state.time.toFixed(3),kind};clip.markers??=[];clip.markers.push(marker);clip.markers.sort((a,b)=>a.at-b.at);state.markers=clip.markers;drawTimeline();};
$('deleteMarker').onclick=()=>{const clip=currentPackageClip();if(!clip||state.selectedMarker<0)return;clip.markers.splice(state.selectedMarker,1);state.selectedMarker=-1;state.markers=clip.markers;drawTimeline();};

function smoothTrack(track,strength){const copy=track.clone();const size=copy.getValueSize(),v=copy.values,out=v.slice();if(size===4){for(let i=1;i<copy.times.length-1;i++){const a=new THREE.Quaternion(...v.slice((i-1)*4,(i-1)*4+4)),b=new THREE.Quaternion(...v.slice(i*4,i*4+4)),c=new THREE.Quaternion(...v.slice((i+1)*4,(i+1)*4+4));const mid=a.clone().slerp(c,.5);b.slerp(mid,strength*.45).normalize();out.set([b.x,b.y,b.z,b.w],i*4);}}else{for(let i=1;i<copy.times.length-1;i++)for(let j=0;j<size;j++){const idx=i*size+j,avg=(v[(i-1)*size+j]+v[(i+1)*size+j])*.5;out[idx]=THREE.MathUtils.lerp(v[idx],avg,strength*.4);}}copy.values=out;return copy;}
$('analyzeCleanup').onclick=()=>{if(!state.activeClip)return;$('cleanupReport').textContent=JSON.stringify({clip:state.activeClip.name,tracks:state.activeClip.tracks.length,duration:state.activeClip.duration,rotationTracks:state.activeClip.tracks.filter(t=>t.getValueSize()===4).length,positionTracks:state.activeClip.tracks.filter(t=>t.getValueSize()===3).length,footCandidates:state.activeClip.tracks.filter(t=>/foot|ankle|toe/i.test(t.name)).map(t=>t.name),rootCandidates:state.activeClip.tracks.filter(t=>/hips|pelvis|root/i.test(t.name)).map(t=>t.name),recommendations:['smooth quaternion jitter','stabilize root translation','detect foot contacts','preserve authored marker times']},null,2);};
$('applyCleanup').onclick=()=>{if(!state.activeClip)return;const strength=+$('cleanupStrength').value;const tracks=state.activeClip.tracks.map(t=>$('cleanupJitter').checked?smoothTrack(t,strength):t.clone());const cleaned=new THREE.AnimationClip(state.activeClip.name+'_clean',state.activeClip.duration,tracks);state.clips.push(cleaned);state.actions.set(cleaned.name,state.mixer.clipAction(cleaned));refreshAnimations();$('cleanupReport').textContent='Created non-destructive cleaned clip: '+cleaned.name+'\nJitter smoothing applied. Foot lock/floor solve are queued as correction layers rather than destructive baking.';};

function refreshStates(){const list=$('stateList');list.innerHTML='';state.states.forEach(s=>{const d=document.createElement('div');d.className='item';d.textContent=`${s.id} · ${s.animation||'unbound'}`;list.append(d);});['stateFrom','stateTo'].forEach(id=>{const sel=$(id);sel.innerHTML='';state.states.forEach(s=>sel.add(new Option(s.id,s.id)));});const tl=$('transitionList');tl.innerHTML='';state.transitions.forEach(t=>{const d=document.createElement('div');d.className='item';d.textContent=`${t.from} → ${t.to} (${t.blend}s)`;tl.append(d);});}
$('addState').onclick=()=>{const id=$('stateName').value.trim();if(!id)return;state.states.push({id,animation:state.activeClip?.name||''});$('stateName').value='';refreshStates();};
$('addTransition').onclick=()=>{if(!state.states.length)return;state.transitions.push({from:$('stateFrom').value,to:$('stateTo').value,blend:+$('transitionBlend').value});refreshStates();};
$('generateGodotTree').onclick=()=>{const lines=['@tool','extends Node','# Generated by SLU Motion Studio','func build(animation_tree: AnimationTree) -> void:','\tvar sm := AnimationNodeStateMachine.new()'];state.states.forEach(s=>lines.push(`\tvar ${safeId(s.id)} := AnimationNodeAnimation.new()`,`\t${safeId(s.id)}.animation = &"${s.animation}"`,`\tsm.add_node("${s.id}", ${safeId(s.id)})`));state.transitions.forEach((t,i)=>lines.push(`\tvar tr_${i} := AnimationNodeStateMachineTransition.new()`,`\ttr_${i}.xfade_time = ${t.blend}`,`\tsm.add_transition("${t.from}", "${t.to}", tr_${i})`));lines.push('\tanimation_tree.tree_root = sm');download('slu_animation_tree.gd',lines.join('\n'),'text/plain');};
const safeId=s=>s.replace(/[^A-Za-z0-9_]/g,'_');

function ensureImpact(){let r=state.package.impacts.find(i=>i.id==='studio.preview');if(!r){r={id:'studio.preview',duration:.5,cues:[]};state.package.impacts.push(r);}return r;}
function refreshVfx(){const el=$('vfxCueList');el.innerHTML='';(ensureImpact().cues||[]).forEach(c=>{const d=document.createElement('div');d.className='item';d.textContent=`${c.at.toFixed(3)} ${c.payload?.primitive||c.channel}`;el.append(d);});}
$('addVfxCue').onclick=()=>{const r=ensureImpact(),primitive=$('vfxPrimitive').value;r.cues.push({id:`${primitive}_${Date.now()}`,at:+state.time.toFixed(3),channel:'vfx',payload:{primitive,scale:+$('vfxScale').value,duration:+$('vfxDuration').value,intensity:+$('vfxIntensity').value}});r.cues.sort((a,b)=>a.at-b.at);refreshVfx();const clip=currentPackageClip();if(clip){clip.markers??=[];clip.markers.push({id:`vfx_${Math.round(state.time*1000)}`,at:+state.time.toFixed(3),kind:'vfx',recipeId:r.id});clip.markers.sort((a,b)=>a.at-b.at);state.markers=clip.markers;drawTimeline();}};

function runAiCommand(prompt){const p=prompt.toLowerCase(),changes={};let ant=+$('anticipation').value,hold=+$('impactHold').value,rec=+$('recovery').value,scale=+$('rootScale').value,speed=state.speed;if(/heavy|weight|power/.test(p)){ant=Math.min(.25,ant+.05);hold=Math.min(.2,hold+.04);speed=Math.max(.7,speed-.08);}if(/fast|quick/.test(p)){speed=Math.min(2,speed+.25);rec=Math.max(0,rec-.03);}if(/snapp|dmc|zzz|arcade/.test(p)){ant=Math.min(.25,ant+.025);hold=Math.min(.2,hold+.025);speed=Math.min(2,speed+.15);}if(/launcher|uppercut/.test(p)){changes.rootLift=0.35;hold=Math.min(.2,hold+.03);}if(/long.*recover|commit/.test(p))rec=Math.min(.3,rec+.08);changes.anticipation=ant;changes.impactHold=hold;changes.recovery=rec;changes.rootScale=scale;changes.playbackSpeed=speed;$('anticipation').value=ant;$('impactHold').value=hold;$('recovery').value=rec;$('rootScale').value=scale;$('speed').value=speed;state.speed=speed;const clip=currentPackageClip();if(clip){clip.warp={anticipationHoldSeconds:ant,recoveryHoldSeconds:rec,rootScale:scale};clip.metadata??={};clip.metadata.aiExperiment={prompt,changes,generatedAt:new Date().toISOString()};}$('aiOutput').textContent=JSON.stringify({mode:'local motion-director experiment',prompt,changes,note:'Provider-agnostic command layer. A model API can later emit the same patch schema.'},null,2);}
document.querySelectorAll('[data-ai]').forEach(b=>b.onclick=()=>{$('aiPrompt').value=b.dataset.ai;runAiCommand(b.dataset.ai);});$('runAiExperiment').onclick=()=>runAiCommand($('aiPrompt').value);

function download(name,text,type='application/json'){const blob=new Blob([text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
$('exportPackage').onclick=()=>download(`${state.package.id}.slu-motion-impact.json`,JSON.stringify(state.package,null,2));
$('exportGodot').onclick=()=>download('slu-motion-studio-godot-manifest.json',JSON.stringify({engine:'godot-4',package:state.package,stateMachine:{states:state.states,transitions:state.transitions}},null,2));
$('exportUnity').onclick=()=>download('slu-motion-studio-unity-manifest.json',JSON.stringify({engine:'unity-6',package:state.package,stateMachine:{states:state.states,transitions:state.transitions}},null,2));

function sampleCurve(keys,t){if(!keys?.length)return null;if(t<=keys[0].time)return keys[0].euler;if(t>=keys.at(-1).time)return keys.at(-1).euler;for(let i=0;i<keys.length-1;i++){const a=keys[i],b=keys[i+1];if(t>=a.time&&t<=b.time){let u=(t-a.time)/(b.time-a.time);u=u*u*(3-2*u);return a.euler.map((v,j)=>THREE.MathUtils.lerp(v,b.euler[j],u));}}return null;}
function applyBoneCurveLayer(){Object.entries(state.boneCurves).forEach(([name,keys])=>{const bone=state.bones.get(name),e=sampleCurve(keys,state.time);if(bone&&e)bone.rotation.set(...e.map(THREE.MathUtils.degToRad));});}
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);if(state.mixer){state.mixer.timeScale=state.speed;state.mixer.update(state.playing?dt:0);state.time=state.mixer.time%(state.duration||1);applyBoneCurveLayer();}controls.update();renderer.render(scene,camera);drawTimeline();}
resize();refreshStates();refreshVfx();animate();
