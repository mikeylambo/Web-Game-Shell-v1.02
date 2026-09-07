import type { MotionImpactPackage } from "../../motion/package.js";
import type { AdapterArtifact, MotionImpactAdapterOptions, MotionImpactEngineAdapter } from "../MotionImpactAdapter.js";

function generateUnityBridge(namespaceName = "SLU"): string {
  return `using System;\nusing System.Collections.Generic;\nusing UnityEngine;\n\nnamespace ${namespaceName}\n{\n    [Serializable] public class SLUMarkerPayload { public string json; }\n\n    public sealed class SLUMotionImpactBridge : MonoBehaviour\n    {\n        public event Action<string,string,string,string> MotionMarker;\n        public event Action<string,string> ImpactRequested;\n\n        public void MotionEvent(string encoded)\n        {\n            // AnimationEvents can pass one string. Format: markerId|kind|recipeId|jsonPayload\n            var parts = encoded.Split(new[]{'|'}, 4);\n            var markerId = parts.Length > 0 ? parts[0] : string.Empty;\n            var kind = parts.Length > 1 ? parts[1] : string.Empty;\n            var recipeId = parts.Length > 2 ? parts[2] : string.Empty;\n            var payload = parts.Length > 3 ? parts[3] : "{}";\n            MotionMarker?.Invoke(markerId, kind, recipeId, payload);\n            if (!string.IsNullOrEmpty(recipeId)) ImpactRequested?.Invoke(recipeId, payload);\n        }\n    }\n}\n`;
}

function generateUnityEditorImporter(namespaceName = "SLU"): string {
  return `#if UNITY_EDITOR\nusing System;\nusing UnityEditor;\nusing UnityEngine;\n\nnamespace ${namespaceName}.Editor\n{\n    public static class SLUMotionMarkerImporter\n    {\n        [Serializable] private class Marker { public string id; public float at; public string kind; public string recipeId; public string payloadJson; }\n\n        public static void ApplyMarkers(AnimationClip clip, Marker[] markers)\n        {\n            if (clip == null || markers == null) return;\n            var events = new AnimationEvent[markers.Length];\n            for (var i = 0; i < markers.Length; i++)\n            {\n                var m = markers[i];\n                events[i] = new AnimationEvent\n                {\n                    time = Mathf.Clamp(m.at, 0f, clip.length),\n                    functionName = "MotionEvent",\n                    stringParameter = $"{m.id}|{m.kind}|{m.recipeId}|{m.payloadJson ?? "{}"}"\n                };\n            }\n            AnimationUtility.SetAnimationEvents(clip, events);\n            EditorUtility.SetDirty(clip);\n        }\n    }\n}\n#endif\n`;
}

export function unityMarkerManifest(pkg: MotionImpactPackage): Record<string, unknown> {
  return Object.fromEntries(pkg.clips.map((clip) => [clip.id, (clip.markers ?? []).map((marker) => ({
    id: marker.id,
    at: marker.at,
    kind: marker.kind,
    recipeId: marker.recipeId ?? "",
    payloadJson: JSON.stringify(marker.payload ?? {}),
  }))]));
}

export class UnityMotionImpactAdapter implements MotionImpactEngineAdapter {
  readonly id = "unity-6";
  readonly displayName = "Unity 6";

  exportPackage(pkg: MotionImpactPackage, options: MotionImpactAdapterOptions = {}): AdapterArtifact[] {
    const namespaceName = options.packageName ? options.packageName.replace(/[^A-Za-z0-9_]/g, "") : "SLU";
    return [
      { path: "SLU/motion-impact.json", content: JSON.stringify(pkg, null, 2), kind: "manifest" },
      { path: "SLU/motion-marker-events.json", content: JSON.stringify(unityMarkerManifest(pkg), null, 2), kind: "resource" },
      { path: "SLU/Runtime/SLUMotionImpactBridge.cs", content: generateUnityBridge(namespaceName), kind: "script" },
      { path: "SLU/Editor/SLUMotionMarkerImporter.cs", content: generateUnityEditorImporter(namespaceName), kind: "script" },
      { path: "SLU/README.md", content: "# SLU Motion/Impact Unity Adapter\n\nImport the character/animation FBX or GLB, attach `SLUMotionImpactBridge` to the animated actor, convert the marker manifest into AnimationEvents, and route `ImpactRequested` to your VFX/audio/camera presentation layer. Use Humanoid Avatar retargeting for `SLU_Humanoid_v1` compatible rigs.\n", kind: "documentation" },
    ];
  }
}
