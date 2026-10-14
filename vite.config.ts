import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Content scripts can't be ES modules, so the content script is bundled as a
// single self-contained IIFE. Files in `public/` (the manifest) are copied to
// `dist/` as-is.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    // Library mode doesn't replace this automatically, and React needs it.
    "process.env.NODE_ENV": JSON.stringify(mode),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: mode === "production",
    sourcemap: mode === "development" ? "inline" : false,
    lib: {
      entry: "src/content/index.tsx",
      formats: ["iife"],
      name: "MoxiteRefinery",
      fileName: () => "content.js",
    },
  },
}));
