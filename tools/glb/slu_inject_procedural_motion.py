#!/usr/bin/env python3
"""Inject a declarative SLU procedural animation into an existing skinned GLB.

This deliberately operates on GLB animation channels rather than requiring Blender.
It is intended for fast certification/prototyping. Production mocap/keyframed clips can
replace the generated animation later without changing SLU move/impact metadata.

Usage:
  python tools/glb/slu_inject_procedural_motion.py \
    --source character.glb \
    --recipe examples/cyber-ronin-heavy-slash.procedural.json \
    --output character-heavy-slash.glb
"""
from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path

GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True)
    p.add_argument("--recipe", required=True)
    p.add_argument("--output", required=True)
    return p.parse_args()


def read_glb(path: Path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC or version != 2 or length != len(data):
        raise RuntimeError("Expected a valid GLB v2 file")
    offset = 12
    doc = None
    binary = b""
    while offset < len(data):
        size, chunk_type = struct.unpack_from("<II", data, offset)
        payload = data[offset + 8: offset + 8 + size]
        offset += 8 + size
        if chunk_type == JSON_CHUNK:
            doc = json.loads(payload.decode("utf-8").rstrip(" \t\r\n\0"))
        elif chunk_type == BIN_CHUNK:
            binary = payload
    if doc is None:
        raise RuntimeError("GLB has no JSON chunk")
    return doc, bytearray(binary)


def pad4(data: bytes, byte: bytes):
    return data + byte * ((4 - len(data) % 4) % 4)


def write_glb(path: Path, doc, binary: bytearray):
    doc.setdefault("buffers", [{}])
    if not doc["buffers"]:
        doc["buffers"].append({})
    doc["buffers"][0]["byteLength"] = len(binary)
    j = pad4(json.dumps(doc, separators=(",", ":")).encode("utf-8"), b" ")
    b = pad4(bytes(binary), b"\0")
    total = 12 + 8 + len(j) + (8 + len(b) if b else 0)
    out = bytearray(struct.pack("<III", GLB_MAGIC, 2, total))
    out += struct.pack("<II", len(j), JSON_CHUNK) + j
    if b:
        out += struct.pack("<II", len(b), BIN_CHUNK) + b
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(out)


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ]


def qaxis(axis, degrees):
    angle = math.radians(degrees) * 0.5
    s, c = math.sin(angle), math.cos(angle)
    if axis == "x": return [s, 0.0, 0.0, c]
    if axis == "y": return [0.0, s, 0.0, c]
    return [0.0, 0.0, s, c]


def qeuler_xyz(degrees):
    x, y, z = degrees
    return qmul(qmul(qaxis("x", x), qaxis("y", y)), qaxis("z", z))


def append_floats(doc, binary, values, accessor_type, count, min_value=None, max_value=None):
    while len(binary) % 4:
        binary.append(0)
    byte_offset = len(binary)
    flat = []
    for value in values:
        if isinstance(value, (list, tuple)):
            flat.extend(float(x) for x in value)
        else:
            flat.append(float(value))
    raw = struct.pack("<" + "f" * len(flat), *flat)
    binary.extend(raw)
    doc.setdefault("bufferViews", []).append({"buffer": 0, "byteOffset": byte_offset, "byteLength": len(raw)})
    view_index = len(doc["bufferViews"]) - 1
    accessor = {"bufferView": view_index, "componentType": 5126, "count": count, "type": accessor_type}
    if min_value is not None: accessor["min"] = min_value
    if max_value is not None: accessor["max"] = max_value
    doc.setdefault("accessors", []).append(accessor)
    return len(doc["accessors"]) - 1


def main():
    args = parse_args()
    source = Path(args.source)
    recipe = json.loads(Path(args.recipe).read_text(encoding="utf-8"))
    doc, binary = read_glb(source)

    times = recipe["times"]
    if sorted(times) != times or not times or times[0] < 0:
        raise RuntimeError("Recipe times must be sorted, non-negative, and non-empty")
    nodes = doc.get("nodes", [])
    node_by_name = {node.get("name"): i for i, node in enumerate(nodes) if node.get("name")}
    missing = [name for name in recipe.get("rotations", {}) if name not in node_by_name]
    if missing:
        raise RuntimeError("Recipe references missing GLB nodes: " + ", ".join(missing))

    input_accessor = append_floats(doc, binary, times, "SCALAR", len(times), [min(times)], [max(times)])
    animation = {
        "name": recipe.get("name", "SLU_ProceduralMotion"),
        "samplers": [],
        "channels": [],
        "extras": {"slu": {"recipeId": recipe.get("id", "procedural"), "markers": recipe.get("markers", [])}},
    }

    for bone, poses in recipe.get("rotations", {}).items():
        if len(poses) != len(times):
            raise RuntimeError(f"Rotation track '{bone}' does not match time count")
        node_index = node_by_name[bone]
        base = nodes[node_index].get("rotation", [0.0, 0.0, 0.0, 1.0])
        quats = [qmul(base, qeuler_xyz(pose)) for pose in poses]
        output = append_floats(doc, binary, quats, "VEC4", len(quats))
        animation["samplers"].append({"input": input_accessor, "output": output, "interpolation": recipe.get("interpolation", "LINEAR")})
        animation["channels"].append({"sampler": len(animation["samplers"]) - 1, "target": {"node": node_index, "path": "rotation"}})

    root = recipe.get("rootTranslation")
    if root:
        bone = root["bone"]
        if bone not in node_by_name:
            raise RuntimeError(f"Root translation bone '{bone}' not present")
        values = root["values"]
        if len(values) != len(times):
            raise RuntimeError("Root translation track does not match time count")
        node_index = node_by_name[bone]
        base = nodes[node_index].get("translation", [0.0, 0.0, 0.0])
        positions = [[base[i] + float(v[i]) for i in range(3)] for v in values]
        output = append_floats(doc, binary, positions, "VEC3", len(positions))
        animation["samplers"].append({"input": input_accessor, "output": output, "interpolation": recipe.get("interpolation", "LINEAR")})
        animation["channels"].append({"sampler": len(animation["samplers"]) - 1, "target": {"node": node_index, "path": "translation"}})

    if recipe.get("replaceAnimations", True):
        doc["animations"] = [animation]
    else:
        doc.setdefault("animations", []).append(animation)
    doc.setdefault("asset", {}).setdefault("extras", {}).setdefault("slu", {})["proceduralMotion"] = {
        "recipeId": recipe.get("id"), "animation": animation["name"]
    }
    write_glb(Path(args.output), doc, binary)
    print(f"[SLU] injected {animation['name']} ({len(animation['channels'])} channels) -> {args.output}")


if __name__ == "__main__":
    main()
