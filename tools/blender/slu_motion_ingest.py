#!/usr/bin/env python3
"""SLU mocap normalization helper for Blender 5.x.

Run with:
  blender --background --python tools/blender/slu_motion_ingest.py -- \
    --source take.fbx --output take.normalized.glb --metadata take.motion.json --fps 60
"""
import argparse
import json
import os
import sys
import bpy


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--fps", type=int, default=60)
    parser.add_argument("--root-motion", choices=["none", "extract", "apply"], default="extract")
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def import_source(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".bvh":
        bpy.ops.import_anim.bvh(filepath=path)
    else:
        raise RuntimeError(f"Unsupported mocap source: {ext}")


def find_armatures():
    return [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]


def action_metadata(armature, fps):
    animation_data = armature.animation_data
    action = animation_data.action if animation_data else None
    if not action:
        return None
    start, end = action.frame_range
    duration = max(0.0, (end - start) / float(fps))
    return {
        "name": action.name,
        "frame_start": float(start),
        "frame_end": float(end),
        "duration": duration,
    }


def export_glb(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_animations=True,
        export_skins=True,
        export_yup=True,
    )


def main():
    args = parse_args()
    clear_scene()
    import_source(os.path.abspath(args.source))
    bpy.context.scene.render.fps = args.fps

    armatures = find_armatures()
    if not armatures:
        raise RuntimeError("No armature found in mocap source")

    primary = armatures[0]
    bones = [bone.name for bone in primary.data.bones]
    metadata = {
        "schema": "slu-motion-probe",
        "version": 1,
        "source": os.path.abspath(args.source),
        "output": os.path.abspath(args.output),
        "fps": args.fps,
        "rootMotion": args.root_motion,
        "armature": primary.name,
        "rootBone": bones[0] if bones else "Root",
        "boneNames": bones,
        "actions": [item for item in (action_metadata(armature, args.fps) for armature in armatures) if item],
    }

    export_glb(os.path.abspath(args.output))
    os.makedirs(os.path.dirname(os.path.abspath(args.metadata)), exist_ok=True)
    with open(args.metadata, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    print("[SLU] normalized", args.source, "->", args.output)
    print("[SLU] metadata", args.metadata)


if __name__ == "__main__":
    main()
