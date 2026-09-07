# SLU Motion Dock v0.1 — 5 Minute Quickstart

The one-hour goal is deliberately narrow: make animation timing + gameplay/VFX markers editable inside Godot without hand-authoring AnimationPlayer method tracks.

## Install into a Godot project

From the Web Game Shell repo:

```bash
node tools/install-slu-motion-godot.mjs /absolute/path/to/your/godot/project
```

Or:

```bash
npm run motion:godot-install -- /absolute/path/to/your/godot/project
```

Restart/reopen Godot. The plugin is enabled automatically and appears as **SLU Motion** in the editor docks.

## Author a move

1. Open the scene containing your animated character.
2. Load a `slu-motion-impact` JSON package in the SLU Motion dock.
3. Click **Scan Edited Scene**.
4. Choose the character's `AnimationPlayer`.
5. Choose the package clip.
6. **Replay**, **Stop**, or scrub the timeline.
7. Move the playhead to an important moment.
8. Enter a marker id, choose its semantic kind, optionally enter an impact recipe id, and click **Add**.
9. Click **Save Package**.
10. Click **Install Markers** to create the Godot Call Method track automatically.

Start from `examples/slu-motion-impact-template.json` if you do not already have a package.

## Marker vocabulary

- `hitbox_on` / `hitbox_off` — combat-active window
- `impact` — contact moment; normally links an ImpactRecipe
- `vfx` — presentation-only timing
- `audio` — audio timing
- `camera` — shake/kick/zoom timing
- `foot_plant` — semantic locomotion/retargeting marker
- `cancel_open` / `cancel_close` — action-game cancel window
- `gameplay` — generic game-side event
- `pose` — semantic authored pose timing
- `custom` — escape hatch

## What v0.1 intentionally does not do

- edit bone curves or keyframes
- automatically clean mocap
- replace Blender for advanced animation correction
- render the final SLU VFX primitives inside the dock
- build a full AnimationTree/state machine

Those are separate problems. v0.1 proves the valuable shared layer: **one move timeline can own animation timing, hitboxes, VFX, audio, camera, and gameplay semantics.**

## Shipping gate

Current branch: `feat/slu-impact-motion-adapter`

Required automated gate:

```bash
npm run check
npm test
```

The installer regression test creates a clean temporary Godot project, installs the addon, and verifies that `project.godot` enables `res://addons/slu_motion/plugin.cfg`.

For a real Godot project, the local smoke gate is:

```bash
godot --headless --editor --path . --quit
godot --headless --path . --quit
```

The Cyber Ronin certification established that Godot imports an SLU-authored GLB animation and exposes it through `AnimationPlayer`; visual animation quality remains an iterative content concern, not an adapter blocker.
