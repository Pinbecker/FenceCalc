import { customerArchiveRequestSchema, customerCreateRequestSchema, customerUpdateRequestSchema } from "@fence-estimator/contracts";
import { z } from "zod";

import { requireAdminRole, requireAuth } from "../authorization.js";
import type { RouteDependencies } from "../routeSupport.js";
import {
  createCustomerForCompany,
  deleteCustomerForCompany,
  setCustomerArchivedStateForCompany,
  updateCustomerForCompany,
} from "../services/customerService.js";

const customerScopeSchema = z.enum(["ALL", "ACTIVE", "ARCHIVED"]).catch("ACTIVE");
const customerRouteParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export function registerCustomerRoutes({ app, config, repository, writeLimiter }: RouteDependencies): void {
  app.get("/api/v1/customers", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const query = (request.query as { scope?: unknown; search?: unknown } | undefined) ?? {};
    const scope = customerScopeSchema.parse(query.scope);
    const search = typeof query.search === "string" ? query.search : "";
    const customers = await repository.listCustomers(authenticated.company.id, scope, search);
    return reply.code(200).send({ customers });
  });

  app.post("/api/v1/customers", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`customer-create:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = customerCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid customer payload",
        details: parsed.error.flatten(),
      });
    }

    const result = await createCustomerForCompany(repository, authenticated, parsed.data);
    if (result.kind === "conflict") {
      return reply.code(409).send({ error: result.message });
    }
    if (result.kind === "customer_not_found") {
      return reply.code(404).send({ error: "Customer not found" });
    }

    return reply.code(201).send({ customer: result.customer });
  });

  app.get("/api/v1/customers/:id", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const params = customerRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid customer route parameters",
        details: params.error.flatten(),
      });
    }

    const customer = await repository.getCustomerById(params.data.id, authenticated.company.id);
    if (!customer) {
      return reply.code(404).send({ error: "Customer not found" });
    }

    return reply.code(200).send({ customer });
  });

  app.put("/api/v1/customers/:id", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`customer-update:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = customerRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid customer route parameters",
        details: params.error.flatten(),
      });
    }

    const parsed = customerUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid customer payload",
        details: parsed.error.flatten(),
      });
    }

    const result = await updateCustomerForCompany(repository, authenticated, params.data.id, parsed.data);
    if (result.kind === "customer_not_found") {
      return reply.code(404).send({ error: "Customer not found" });
    }
    if (result.kind === "conflict") {
      return reply.code(409).send({ error: result.message });
    }

    return reply.code(200).send({ customer: result.customer });
  });

  app.put("/api/v1/customers/:id/archive", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`customer-archive:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = customerRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid customer route parameters",
        details: params.error.flatten(),
      });
    }

    const parsed = customerArchiveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid customer archive payload",
        details: parsed.error.flatten(),
      });
    }

    const result = await setCustomerArchivedStateForCompany(repository, authenticated, params.data.id, parsed.data.archived, parsed.data.cascadeDrawings);
    if (result.kind === "customer_not_found") {
      return reply.code(404).send({ error: "Customer not found" });
    }
    if (result.kind === "conflict") {
      return reply.code(409).send({ error: result.message });
    }

    return reply.code(200).send({ customer: result.customer });
  });

  app.delete("/api/v1/customers/:id", async (request, reply) => {
    const authenticated = await requireAdminRole(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`customer-delete:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = customerRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid customer route parameters",
        details: params.error.flatten(),
      });
    }

    const result = await deleteCustomerForCompany(repository, authenticated, params.data.id);
    if (result.kind === "customer_not_found") {
      return reply.code(404).send({ error: "Customer not found" });
    }
    if (result.kind === "not_archived") {
      return reply.code(400).send({ error: "Customer must be archived before it can be deleted" });
    }
    if (result.kind === "has_active_drawings") {
      return reply.code(400).send({ error: "Customer still has active drawings. Archive or delete them first." });
    }

    return reply.code(200).send({ deleted: true });
  });
}
