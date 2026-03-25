import react from "@vitejs/plugin-react-swc";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";

import { workspaceAliases } from "../../workspaceAliases";

function readNonEmptyEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

const shouldUploadSourcemaps =
  readNonEmptyEnv("SENTRY_AUTH_TOKEN") !== null &&
  readNonEmptyEnv("SENTRY_ORG") !== null &&
  readNonEmptyEnv("SENTRY_PROJECT") !== null;

function getSentryPlugin() {
  const authToken = readNonEmptyEnv("SENTRY_AUTH_TOKEN");
  const org = readNonEmptyEnv("SENTRY_ORG");
  const project = readNonEmptyEnv("SENTRY_PROJECT");

  if (!authToken || !org || !project) {
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
