import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
  },
  plugins: [react()],
  publicDir: false,
  build: {
    emptyOutDir: false,
    lib: {
      entry: "app/javascript/spa/main.tsx",
      formats: ["es"],
      fileName: () => "spa.js",
    },
    minify: mode === "production",
    outDir: "app/assets/builds",
    rollupOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
}));
