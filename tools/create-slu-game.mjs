#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const get = (name, fallback = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] ?? fallback : fallback;
};

const gameId = get("id", "new-slu-game");
const gameName = get("name", gameId);
const renderer = get("renderer", "three");
const frames = get("frames", "arcade").split(",").map(x => x.trim()).filter(Boolean);
const out = path.resolve(get("out", `./${gameId}`));

const assembly = {
  arcade: "createArcadeAssembly",
  "character-action": "createCharacterActionAssembly",
  "arena-combat": "createArenaCombatAssembly",
  "high-mobility-combat": "createHighMobilityCombatAssembly",
  survivor: "createSurvivorAssembly",
  vehicle: "createVehicleAssembly",
  fps: "createFPSAssembly",
  puzzle: "createPuzzleAssembly",
  rpg: "createRPGAssembly",
  strategy: "createStrategyAssembly",
  platformer: "createPlatformerAssembly",
  "party-multiplayer": "createPartyMultiplayerAssembly"
};
const adapter = {
  three: "createThreeStarterAdapter",
  babylon: "createBabylonStarterAdapter",
  phaser: "PhaserAdapter",
  canvas2d: "createCanvas2DStarterAdapter",
  dom: "createDOMStarterAdapter"
};

if (!adapter[renderer]) {
  console.error(`Unknown renderer: ${renderer}`);
  process.exit(1);
}
const unknownFrames = frames.filter((x) => !assembly[x]);
if (unknownFrames.length) {
  console.error(`Unknown frame(s): ${unknownFrames.join(", ")}`);
  process.exit(1);
}

const selected = frames.map(x => assembly[x]).filter(Boolean);
fs.mkdirSync(path.join(out, "src"), { recursive: true });

const rendererLine =
 renderer === "dom"
 ? `const rendererAdapter = createDOMStarterAdapter(document.getElementById("game")!);`
 : renderer === "phaser"
 ? `const rendererAdapter = new PhaserAdapter(); // wire your Phaser.Game hooks here`
 : `const rendererAdapter = ${adapter[renderer]}(document.getElementById("game-canvas") as HTMLCanvasElement);`;

const imports = [...selected, adapter[renderer]].join(",\n  ");
const proceduralImport = renderer === "three"
  ? `import { bootProceduralVisualManifest } from "./art/procedural/visualManifest";\n`
  : "";
const proceduralBoot = renderer === "three" ? `\nbootProceduralVisualManifest();\n` : "";

fs.writeFileSync(path.join(out, "src/main.ts"), `${proceduralImport}import {
  createGameApp,
  ${imports}
} from "@slu/web-shell";

${rendererLine}
${proceduralBoot}
const app = await createGameApp({
  gameId: "${gameId}",
  gameName: "${gameName}",
  version: "0.1.0",
  renderer: rendererAdapter,
  root: document.getElementById("ui")!,
  assemblies: [
    ${selected.map(f => `(shell) => ${f}({ shell })`).join(",\n    ")}
  ]
});

console.log("SLU game ready", app);
`);

if (renderer === "three") {
  const proceduralDir = path.join(out, "src", "art", "procedural");
  const modelsDir = path.join(proceduralDir, "models");
  fs.mkdirSync(modelsDir, { recursive: true });

  fs.writeFileSync(path.join(proceduralDir, "ProceduralVisualRegistry.ts"), `import * as THREE from "three";
import { createVisualRegistry, type VisualRegistration } from "@slu/web-shell";

export interface ProceduralVisualContext {
  key: string;
  anchor?: THREE.Object3D;
  metadata?: Readonly<Record<string, unknown>>;
}

export type ProceduralVisualRegistration = VisualRegistration<THREE.Group, ProceduralVisualContext>;
export const proceduralVisuals = createVisualRegistry<THREE.Group, ProceduralVisualContext>();

export function registerProceduralVisual(key: string, registration: ProceduralVisualRegistration): void {
  proceduralVisuals.register(key, registration);
}

export function replaceProceduralVisual(key: string, registration: ProceduralVisualRegistration): void {
  proceduralVisuals.replace(key, registration);
}
`);

  fs.writeFileSync(path.join(proceduralDir, "attachProceduralVisual.ts"), `import * as THREE from "three";
import { proceduralVisuals, type ProceduralVisualContext } from "./ProceduralVisualRegistry";

export function attachProceduralVisual(
  anchor: THREE.Object3D,
  key: string,
  metadata?: Readonly<Record<string, unknown>>
): THREE.Group | null {
  const context: ProceduralVisualContext = { key, anchor, metadata };
  const instance = proceduralVisuals.create(key, context);
  if (!instance) return null;
  const visual = instance.visual;
  visual.userData.sluPresentationOnly = true;
  visual.userData.sluVisualKey = key;
  visual.userData.sluVisualInstance = instance;
  visual.traverse((child) => {
    child.userData.sluPresentationOnly = true;
    child.userData.sluVisualKey = key;
  });
  anchor.add(visual);
  return visual;
}

export function detachProceduralVisual(visual: THREE.Object3D): void {
  const instance = visual.userData.sluVisualInstance as { dispose?: () => void } | undefined;
  instance?.dispose?.();
  visual.removeFromParent();
  visual.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
}
`);

  fs.writeFileSync(path.join(proceduralDir, "visualManifest.ts"), `import { proceduralVisuals } from "./ProceduralVisualRegistry";

/**
 * Single registration point for approved image-to-Three.js assets.
 * Put generated factories under ./models and register stable keys here.
 */
export function bootProceduralVisualManifest(): void {
  if (import.meta.env.DEV && proceduralVisuals.keys().length > 0) {
    console.info("SLU procedural visuals", proceduralVisuals.keys());
  }
}
`);

  fs.writeFileSync(path.join(modelsDir, "README.md"), `# Procedural models

Put approved img2threejs-style THREE.Group factories here, then register them in ../visualManifest.ts.
Keep gameplay collision and authoritative state outside presentation geometry.
`);
}

fs.writeFileSync(path.join(out, "index.html"), `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${gameName}</title>
  <style>
    html,body,#game{margin:0;width:100%;height:100%;overflow:hidden;background:#08090c}
    #game-canvas{display:block;width:100%;height:100%}
  </style>
</head>
<body>
  <div id="game"><canvas id="game-canvas"></canvas></div>
  <div id="ui"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>`);

const dependencies = { "@slu/web-shell": "^1.0.0" };
const devDependencies = { typescript: "^5.8.3", vite: "^7.0.0" };
if (renderer === "three") {
  dependencies.three = "^0.180.0";
  devDependencies["@types/three"] = "^0.180.0";
}

fs.writeFileSync(path.join(out, "package.json"), JSON.stringify({
  name: gameId,
  private: true,
  version: "0.1.0",
  type: "module",
  scripts: { dev: "vite", build: "vite build", check: "tsc --noEmit" },
  dependencies,
  devDependencies
}, null, 2));

fs.writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    target: "ES2022", module: "ES2022", moduleResolution: "Bundler",
    lib: ["ES2022","DOM"], types: ["vite/client"], strict: true, skipLibCheck: true
  },
  include: ["src/**/*.ts"]
}, null, 2));

fs.writeFileSync(path.join(out, "README.md"), `# ${gameName}

Generated by SLU Web Shell 1.0.

Renderer: ${renderer}
Frames: ${frames.join(", ")}

The game already boots through Title → Main Menu → Mode flow with keyboard/gamepad UI,
settings/pause/results screens, persistence, input, and the modules supplied by its Frames.

${renderer === "three" ? "Three.js games also include an image-to-procedural-visual registry and manifest under src/art/procedural/.\n\n" : ""}Replace the starter renderer hooks and placeholder content selections with Game DNA.
`);

console.log(`Created ${gameName} at ${out}`);
