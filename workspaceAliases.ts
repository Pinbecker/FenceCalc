import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname);

export const workspaceAliases = {
  "@fence-estimator/contracts": resolve(repoRoot, "packages/contracts/src/index.ts"),
  "@fence-estimator/geometry": resolve(repoRoot, "packages/geometry/src/index.ts"),
  "@fence-estimator/rules-engine": resolve(repoRoot, "packages/rules-engine/src/index.ts")
};
