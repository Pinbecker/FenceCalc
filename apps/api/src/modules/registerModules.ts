import type { RouteDependencies } from "../routeSupport.js";

import { registerAuditRoutes } from "../routes/registerAuditRoutes.js";
import { registerAuthRoutes } from "../routes/registerAuthRoutes.js";
import { registerCustomerRoutes } from "../routes/registerCustomerRoutes.js";
import { registerCompanyConfigurationRoutes } from "../routes/registerCompanyConfigurationRoutes.js";
import { registerDrawingRoutes } from "../routes/registerDrawingRoutes.js";
import { registerEstimateRoutes } from "../routes/registerEstimateRoutes.js";
import { registerEstimateLifecycleRoutes } from "../routes/registerEstimateLifecycleRoutes.js";
import { registerPricingRoutes } from "../routes/registerPricingRoutes.js";
import { registerProjectRoutes } from "../routes/registerProjectRoutes.js";
import { registerQuoteRoutes } from "../routes/registerQuoteRoutes.js";
import { registerSetupRoutes } from "../routes/registerSetupRoutes.js";
import { registerSiteRoutes } from "../routes/registerSiteRoutes.js";
import { registerUserRoutes } from "../routes/registerUserRoutes.js";

export function registerModules(dependencies: RouteDependencies): void {
  registerEstimateRoutes(dependencies);
  registerEstimateLifecycleRoutes(dependencies);
  registerSetupRoutes(dependencies);
  registerAuthRoutes(dependencies);
  registerUserRoutes(dependencies);
  registerCustomerRoutes(dependencies);
  registerCompanyConfigurationRoutes(dependencies);
  registerSiteRoutes(dependencies);
  registerProjectRoutes(dependencies);
  registerQuoteRoutes(dependencies);
  registerDrawingRoutes(dependencies);
  registerPricingRoutes(dependencies);
  registerAuditRoutes(dependencies);
}
