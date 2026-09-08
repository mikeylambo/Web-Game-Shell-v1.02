// Minimal browser-facing Shell surface vendored by INKSTONE during the V0.5 migration.
// Keep this list intentionally narrow so public games receive only the compiled
// runtime they actually need, not the private Shell source tree or unused adapters.
export { SLUWebShell } from "../src/Shell.js";
export { BrowserStorage } from "../src/platform/browser/BrowserStorage.js";
export { SettingsStore } from "../src/persistence/SettingsStore.js";
export { AssemblyComposer } from "../src/assemblies/AssemblyComposer.js";
export { createCharacterActionAssembly } from "../src/assemblies/characterAction.js";
export { createArcadeAssembly } from "../src/assemblies/arcade.js";
export { mountBrowserDevConsole } from "../src/debug/DevConsole.js";
