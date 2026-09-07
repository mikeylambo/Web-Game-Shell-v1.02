# SLU Web Game Shell — Agent Instructions

## Procedural visual authoring

For approved hard-surface visual assets in Three.js consumers, use the installed `img2threejs` skill when available. Treat it as an authoring-time reconstruction tool, not a runtime dependency.

Workflow:
1. Start from an approved reference image.
2. Run the real `img2threejs` staged reconstruction workflow and visual comparison gates.
3. Emit clean procedural Three.js/TypeScript factories (`THREE.Group`) with useful named pivots/sockets.
4. Integrate generated art through the consumer game's procedural visual registry/manifest rather than importing generated model files directly from gameplay logic.
5. Keep gameplay collision, targeting, state, and deterministic logic authoritative and separate from presentation geometry.
6. Preserve a simple fallback visual where appropriate.
7. Run the shell verification suite after shell changes.

The shell itself remains renderer-neutral. Do not add Three.js as a core runtime dependency solely for generated visuals; Three.js-specific procedural scaffolding belongs in generated Three.js games/adapters.
