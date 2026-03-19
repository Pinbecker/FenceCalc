import { defineConfig } from "vitest/config";

import { workspaceAliases } from "./workspaceAliases";

export default defineConfig({
  resolve: {
    alias: workspaceAliases
  }
});
