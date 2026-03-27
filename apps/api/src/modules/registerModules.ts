import type { RouteDependencies } from "../routeSupport.js";

import { registerAuditRoutes } from "./audit/index.js";
import { registerAuthRoutes } from "./auth/index.js";
import { registerCustomerRoutes } from "./customers/index.js";
import { registerDrawingRoutes } from "./drawings/index.js";
import { registerEstimateRoutes } from "./estimate/index.js";
import { registerJobRoutes } from "./jobs/index.js";
import { registerPricingRoutes } from "./pricing/index.js";
import { registerSetupRoutes } from "./setup/index.js";
import { registerUserRoutes } from "./users/index.js";

export function registerModules(dependencies: RouteDependencies): void {
  registerEstimateRoutes(dependencies);
  registerSetupRoutes(dependencies);
  registerAuthRoutes(dependencies);
  registerUserRoutes(dependencies);
  registerCustomerRoutes(dependencies);
  registerJobRoutes(dependencies);
  registerDrawingRoutes(dependencies);
  registerPricingRoutes(dependencies);
  registerAuditRoutes(dependencies);
}
