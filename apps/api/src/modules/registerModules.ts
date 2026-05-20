import type { RouteDependencies } from "../routeSupport.js";

import { registerAuditRoutes } from "../routes/registerAuditRoutes.js";
import { registerAuthRoutes } from "../routes/registerAuthRoutes.js";
import { registerCustomerRoutes } from "../routes/registerCustomerRoutes.js";
import { registerDrawingRoutes } from "../routes/registerDrawingRoutes.js";
import { registerEstimateRoutes } from "../routes/registerEstimateRoutes.js";
import { registerPricingRoutes } from "../routes/registerPricingRoutes.js";
import { registerProjectRoutes } from "../routes/registerProjectRoutes.js";
import { registerSetupRoutes } from "../routes/registerSetupRoutes.js";
import { registerUserRoutes } from "../routes/registerUserRoutes.js";

export function registerModules(dependencies: RouteDependencies): void {
  registerEstimateRoutes(dependencies);
  registerSetupRoutes(dependencies);
  registerAuthRoutes(dependencies);
  registerUserRoutes(dependencies);
  registerCustomerRoutes(dependencies);
  registerProjectRoutes(dependencies);
  registerDrawingRoutes(dependencies);
  registerPricingRoutes(dependencies);
  registerAuditRoutes(dependencies);
}
