import react from "@vitejs/plugin-react-swc";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";

import { workspaceAliases } from "../../workspaceAliases";

const shouldUploadSourcemaps =
  typeof process.env.SENTRY_AUTH_TOKEN === "string" &&
  typeof process.env.SENTRY_ORG === "string" &&
  typeof process.env.SENTRY_PROJECT === "string";

function getSentryPlugin() {
  const authToken = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  if (typeof authToken !== "string" || typeof org !== "string" || typeof project !== "string") {
    return null;
  }

  return sentryVitePlugin({
    authToken,
    org,
    project,
    release: {
      name: process.env.VITE_SENTRY_RELEASE ?? process.env.npm_package_version ?? "0.1.0"
    }
  });
}

const sentryPlugin = shouldUploadSourcemaps ? getSentryPlugin() : null;

export default defineConfig({
  plugins: [
    react(),
    ...(sentryPlugin ? [sentryPlugin] : [])
  ],
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
    sourcemap: shouldUploadSourcemaps ? "hidden" : false,
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
