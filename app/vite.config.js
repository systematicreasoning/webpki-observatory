import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";

/**
 * Vite plugin that reads the pre-built UI bundle and exposes it
 * as a virtual ES module.
 *
 * All data transforms (field renaming, trust scope filtering, derived
 * metrics) happen in pipeline/export_ui_bundle.py. This plugin just
 * reads the result and makes it available to the app.
 *
 * Fallback: if ui_bundle.json doesn't exist, falls back to the
 * legacy transform pipeline for backwards compatibility during
 * transition.
 */
function pipelineDataPlugin() {
  const virtualModuleId = "virtual:pipeline-data";
  const resolvedId = "\0" + virtualModuleId;

  return {
    name: "pipeline-data",
    resolveId(id) {
      if (id === virtualModuleId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;

      const dataDir = process.env.PIPELINE_DATA_DIR || resolve(__dirname, "../data");
      const bundlePath = resolve(dataDir, "ui_bundle.json");

      if (!existsSync(bundlePath)) {
        console.error("[pipeline-data] ERROR: ui_bundle.json not found at", bundlePath);
        console.error("[pipeline-data] Run: python pipeline/export_ui_bundle.py");
        throw new Error("ui_bundle.json not found. Run pipeline/export_ui_bundle.py first.");
      }

      const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));

      console.log("[pipeline-data]",
        bundle.CA_DATA?.length || 0, "CAs,",
        Object.keys(bundle.ROOTS || {}).length, "CAs with roots,",
        Object.values(bundle.ROOTS || {}).reduce((s, a) => s + a.length, 0), "roots,",
        (bundle.INCIDENTS_DATA?.cas || []).length, "CAs with incidents");

      if (bundle.DISTRUST_DATA?.events) {
        console.log("[pipeline-data] Distrust:", bundle.DISTRUST_DATA.events.length, "events");
      }
      if (bundle.RPE_DATA?.meta) {
        console.log("[pipeline-data] RPE:",
          bundle.RPE_DATA.meta.bugs_with_comments || 0, "bugs analyzed,",
          bundle.RPE_DATA.meta.total_comments_analyzed || 0, "comments");
      }

      return "export default " + JSON.stringify(bundle) + ";";
    },
  };
}

export default defineConfig({
  plugins: [react(), pipelineDataPlugin()],
  base: process.env.VITE_BASE_PATH || "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  },
});
