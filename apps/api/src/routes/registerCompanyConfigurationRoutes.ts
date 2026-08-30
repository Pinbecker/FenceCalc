import {
  companyConfigurationDraftUpdateRequestSchema,
  companyConfigurationPreviewRequestSchema,
  companyConfigurationPublishRequestSchema,
  companyConfigurationTemplateCloneRequestSchema,
} from "@fence-estimator/contracts";

import { requireAdmin } from "../authorization.js";
import type { RouteDependencies } from "../routeSupport.js";
import {
  cloneCompanyConfigurationTemplate,
  getCompanyConfigurationWorkspace,
  previewConfiguration,
  publishCompanyConfiguration,
  updateCompanyConfigurationDraft,
} from "../services/companyConfigurationService.js";

export function registerCompanyConfigurationRoutes({
  app,
  config,
  repository,
  writeLimiter,
}: RouteDependencies): void {
  app.get("/api/v1/company-configuration", async (request, reply) => {
    const auth = await requireAdmin(request, reply, repository, config);
    if (!auth) return reply;
    return reply
      .code(200)
      .send({
        workspace: await getCompanyConfigurationWorkspace(
          repository,
          auth.company.id,
          auth.user.id,
        ),
      });
  });

  app.put("/api/v1/company-configuration/draft", async (request, reply) => {
    const auth = await requireAdmin(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`company-configuration:${request.ip}`))
      return reply.code(429).send({ error: "Rate limit exceeded" });
    const parsed = companyConfigurationDraftUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "Invalid company configuration draft", details: parsed.error.flatten() });
    const workspace = await updateCompanyConfigurationDraft(
      repository,
      auth.company.id,
      auth.user.id,
      parsed.data.definition,
      parsed.data.changeNote ?? null,
    );
    return reply.code(200).send({ workspace });
  });

  app.post("/api/v1/company-configuration/preview", async (request, reply) => {
    const auth = await requireAdmin(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = companyConfigurationPreviewRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "Invalid preview example", details: parsed.error.flatten() });
    return reply
      .code(200)
      .send({ preview: previewConfiguration(parsed.data.definition, parsed.data.facts) });
  });

  app.post("/api/v1/company-configuration/templates/clone", async (request, reply) => {
    const auth = await requireAdmin(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = companyConfigurationTemplateCloneRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "Invalid configuration template", details: parsed.error.flatten() });
    const workspace = await cloneCompanyConfigurationTemplate(
      repository,
      auth.company.id,
      auth.user.id,
      parsed.data.templateId,
    );
    return workspace
      ? reply.code(200).send({ workspace })
      : reply.code(404).send({ error: "Configuration template not found" });
  });

  app.post("/api/v1/company-configuration/publish", async (request, reply) => {
    const auth = await requireAdmin(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`company-configuration-publish:${request.ip}`))
      return reply.code(429).send({ error: "Rate limit exceeded" });
    const parsed = companyConfigurationPublishRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "A publish note is required", details: parsed.error.flatten() });
    try {
      const workspace = await publishCompanyConfiguration(
        repository,
        auth.company.id,
        auth.user.id,
        parsed.data.changeNote,
        parsed.data.facts,
      );
      return reply.code(200).send({ workspace });
    } catch (error) {
      return reply
        .code(409)
        .send({
          error: error instanceof Error ? error.message : "Configuration could not be published",
        });
    }
  });
}
