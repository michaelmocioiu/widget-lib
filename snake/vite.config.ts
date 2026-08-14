import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  // React's own bundle reads process.env.NODE_ENV -- app builds get this for
  // free from Vite's default app-mode define, but lib mode doesn't inject it
  // automatically, so bundling react-dom here throws "process is not
  // defined" at runtime on a bare host page with no Node shim.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/entry.ts"),
      name: "SnakeDuel",
      formats: ["iife"],
      fileName: () => "snake.js",
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Everything (React included) bundles in -- the host page has no
        // dependency of its own to share, and the built CSS is inlined at
        // mount() time rather than requiring a separate <link>.
        inlineDynamicImports: true,
      },
    },
  },
});
