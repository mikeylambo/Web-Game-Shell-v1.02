# SLU Motion / Impact Pipeline

Goal: author motion once, bind impact/VFX once, and carry both into web, Godot, and Unity through adapters.

## Target workflow

1. Capture or upload motion (video-derived mocap, FBX, BVH, GLB/GLTF, or keyframed clip).
2. Normalize source skeleton into a `RigMap`.
3. Retarget the clip to the project's canonical humanoid/mech rig.
4. Clean root motion and foot plants.
5. Add semantic `MotionMarker`s such as `hitbox_on`, `impact`, `foot_plant`, `vfx`, and `audio`.
6. Bind marker IDs to portable `ImpactRecipe`s.
7. Export through an engine adapter.
8. Engine runtime plays animation and dispatches the same semantic markers to VFX/audio/gameplay.

## Why animation and VFX share one timeline

An attack should be authored as a synchronized performance rather than separate animation and effects files. A marker at 0.410 seconds can simultaneously request a hit check, impact recipe, sound event, camera impulse, and hit-stop while remaining portable across runtimes.

## Canonical asset bundle

A future `.slu-motion` package should contain:

- source clip reference
- normalized/retargeted clip reference
- source and target `RigMap`
- root-motion policy
- semantic markers
- linked impact recipe IDs
- import warnings and retarget report
- engine-specific generated manifests

## Adapter order

### 1. Godot

First certification target. Current branch includes `createGodotMotionImpactManifest()` and method-track generation for motion markers. Next step is a Godot add-on/importer that creates AnimationPlayer method tracks and resolves recipes at runtime.

### 2. Unity

Use Humanoid Avatar/Animator where possible, preserving semantic markers as Animation Events or a parallel timeline asset. VFX Graph/Particle System bindings should interpret the same impact recipe vocabulary.

### 3. Web / Three.js

Use GLTF animation clips plus a runtime marker clock. This remains the fastest place to preview/edit motion and impact together.

## Mocap requirements

The pipeline must not depend on one capture vendor. Input adapters should be able to accept normalized joint animation from tools such as video mocap services, Blender cleanup, Rokoko-style data, or direct BVH/FBX/GLB sources.

The system should preserve source provenance while converting motion to a stable internal representation.

## Near-term gates

- public motion/impact contracts compile in the shell
- Mech Survivor can trigger at least blade, missile, dash, enemy death, and level-up impact recipes through the bridge
- Godot importer can reproduce marker timing within one rendered frame at 60 fps
- one uploaded mocap clip can be retargeted onto the canonical mech rig
- same clip + markers can be exported to Godot and web without re-authoring timing
- root-motion and foot-plant warnings are visible rather than silently accepted

## Non-goals for the first adapter

- automatic perfect mocap cleanup
- proprietary motion generation
- replacing Blender for advanced hand correction
- engine-specific animation state-machine authoring

Those can be layered on after the portable contract is proven.
