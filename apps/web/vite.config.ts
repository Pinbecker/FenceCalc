import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

import { workspaceAliases } from "../../workspaceAliases";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: workspaceAliases
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 5173,
    strictPort: true,
    host: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/konva") || id.includes("node_modules/react-konva")) {
            return "editor-canvas";
          }

          return undefined;
        }
      }
    }
  }
});
