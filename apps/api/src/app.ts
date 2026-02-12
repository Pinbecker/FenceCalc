import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  estimateSnapshotRequestSchema,
  layoutModelSchema,
  type EstimateResult,
  type LayoutModel
} from "@fence-estimator/contracts";
import { estimateLayout } from "@fence-estimator/rules-engine";

import { InMemorySnapshotRepository, type SnapshotRepository } from "./repository.js";

function normalizeLayout(layout: LayoutModel): LayoutModel {
  return {
    segments: layout.segments.map((segment) => ({
      ...segment,
      start: { x: Math.round(segment.start.x), y: Math.round(segment.start.y) },
      end: { x: Math.round(segment.end.x), y: Math.round(segment.end.y) }
    }))
  };
}

export function buildApp(repository?: SnapshotRepository) {
  const app = Fastify({
    logger: true
  });
  app.register(cors, { origin: true });

  const snapshots = repository ?? new InMemorySnapshotRepository();

  app.get("/health", () => ({
    ok: true,
    service: "fence-estimator-api",
    timestampIso: new Date().toISOString()
  }));

  app.post("/api/v1/estimate", async (request, reply) => {
    const parsed = layoutModelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid layout payload",
        details: parsed.error.flatten()
      });
    }

    const normalized = normalizeLayout(parsed.data);
    let estimate: EstimateResult;
    try {
      estimate = estimateLayout(normalized);
    } catch (error) {
      return reply.code(400).send({
        error: "Invalid layout configuration",
        details: (error as Error).message
      });
    }
    return reply.code(200).send({ layout: normalized, estimate });
  });

  app.post("/api/v1/snapshots", async (request, reply) => {
    const parsed = estimateSnapshotRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid snapshot payload",
        details: parsed.error.flatten()
      });
    }

    const layout = normalizeLayout(parsed.data.layout);
    let estimate: EstimateResult;
    try {
      estimate = estimateLayout(layout);
    } catch (error) {
      return reply.code(400).send({
        error: "Invalid layout configuration",
        details: (error as Error).message
      });
    }
    const snapshot = {
      id: randomUUID(),
      createdAtIso: new Date().toISOString(),
      layout,
      estimate
    };

    await snapshots.create(snapshot);
    return reply.code(201).send(snapshot);
  });

  app.get("/api/v1/snapshots/:id", async (request, reply) => {
    const params = request.params as { id?: string };
    if (!params.id) {
      return reply.code(400).send({ error: "Missing snapshot id" });
    }
    const snapshot = await snapshots.getById(params.id);
    if (!snapshot) {
      return reply.code(404).send({ error: "Snapshot not found" });
    }
    return reply.code(200).send(snapshot);
  });

  return app;
}
