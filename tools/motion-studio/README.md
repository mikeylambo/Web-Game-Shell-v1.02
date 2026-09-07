# SLU Motion Studio

Standalone character-animation / game-move authoring workspace.

The goal is not to recreate all of Blender. The goal is to replace the routine game-character pipeline:

**character → rig → animation → cleanup → motion shaping → hit timing → VFX/audio/camera → state graph → engine export**

## Run

```bash
cd tools/motion-studio
npm install
npm run dev
```

Production gate:

```bash
npm run build
```

## Current status

| Area | Status | What works now |
| --- | --- | --- |
| Three.js character viewport | Working | GLB/GLTF import, orbit camera, lighting, model fitting |
| Animation playback | Working | Embedded clips, play/pause/stop, speed, timeline scrub |
| Rig inspection | Working | Bone discovery, selection, common/Mixamo/Unreal semantic auto-map |
| Sockets | Working | Bind named sockets to selected bones |
| SLU package I/O | Working | Load/export `slu-motion-impact` package data |
| Master timeline | Working | Semantic lanes, markers, selection, add/delete, playhead |
| Bone editing | Working baseline | Direct Euler pose edits and additive rotation keys |
| Bone curve editor | In progress | Stored/interpolated additive rotation keys; dedicated tangent/channel editor is next |
| Mocap analysis | Working baseline | Track inventory, foot/root candidate discovery, cleanup report |
| Jitter cleanup | Working baseline | Non-destructive vector/quaternion smoothing into a new clip |
| Foot locking | In progress | UI + contact candidates exist; world-space contact solve not yet baked |
| Floor solve | In progress | Controls exist; automatic floor/contact correction algorithm is next |
| Root stabilization | In progress | Root tracks identified; full correction layer not yet implemented |
| Animation state graph | Working baseline | Author states/transitions and generate Godot state-machine builder GDScript |
| Godot adapter | Working | Portable package + separate Godot Motion Dock/runtime adapter |
| Unity adapter | Working baseline | Portable package/marker manifests and import event adapter |
| VFX authoring | Working baseline | Create ImpactRecipe VFX cues and bind them to motion markers |
| VFX viewport preview | In progress | Recipe data works; Three viewport primitive playback is next |
| AI Motion Director | Experimental | Provider-agnostic structured motion patches; local heuristic director proves patch contract |
| Real AI provider | Not wired | Model-backed animation suggestions/generation remain an adapter task |
| Mocap/video ingestion | Pipeline ready | FBX/BVH/GLB normalization helper exists outside Studio; drag-in binary ingestion integration is next |
| Blender replacement | Partial | Routine inspection/pose/cleanup/move authoring is moving here; mesh surgery, weighting, sculpting remain Blender tasks |

## Workspace

The Studio is deliberately one workspace instead of six separate tools:

```text
Character / Rig
      ↓
Animation / Retarget
      ↓
Cleanup + Bone Curves
      ↓
MASTER TIMELINE
  Animation
  Hitboxes
  VFX
  Audio
  Camera
  Gameplay
  Cancels
      ↓
State Graph
      ↓
SLU Motion/Impact package
      ↓
Godot / Unity / Three.js
```

## Data rule

Engine-specific details stay at the edge. The authored move remains engine-neutral.

A mocap take, procedural animation, purchased clip, hand-keyed animation, or future AI-generated motion should all be able to target the same move semantics and ImpactRecipe bindings.

## Near-term build order

1. Dedicated multi-channel curve editor: translation / rotation / scale, X/Y/Z, draggable keys, linear/smooth/step interpolation, tangent handles.
2. World-space foot contact detection + floor solve + foot locking correction layer.
3. Root stabilization and root-motion trajectory editor.
4. Live Three.js SLU VFX preview on sockets and impact positions.
5. Visual state graph with interrupt/cancel conditions and Godot/Unity generation.
6. Provider interface for AI-generated `MotionPatch` suggestions and video-derived motion ingestion.

Do not mark a subsystem complete because a control exists. It is complete only when its output survives the engine adapter and a real character certification.
