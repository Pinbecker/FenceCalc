import { describe, expect, it } from "vitest";

import type { DrawingSummary } from "@fence-estimator/contracts";

import { buildFallbackJobSummaries, hasLegacyJoblessDrawings, resolveJobWorkspaceTarget } from "./jobFallbacks.js";

const baseDrawing: DrawingSummary = {
  id: "drawing-1",
  companyId: "company-1",
  name: "Job Alpha",
  customerId: "customer-1",
  customerName: "Acme School",
  previewLayout: { segments: [], gates: [] },
  segmentCount: 5,
  gateCount: 1,
  schemaVersion: 1,
  rulesVersion: "2026-03-27",
  versionNumber: 2,
  revisionNumber: 0,
  status: "DRAFT",
  isArchived: false,
  archivedAtIso: null,
  archivedByUserId: null,
  statusChangedAtIso: null,
  statusChangedByUserId: null,
  createdByUserId: "user-1",
  createdByDisplayName: "Jane Doe",
  updatedByUserId: "user-1",
  updatedByDisplayName: "Jane Doe",
  contributorUserIds: ["user-1"],
  contributorDisplayNames: ["Jane Doe"],
  createdAtIso: "2026-03-27T09:00:00.000Z",
  updatedAtIso: "2026-03-27T10:00:00.000Z"
};

describe("jobFallbacks", () => {
  it("groups drawings with the same job id into one fallback job", () => {
    const jobs = buildFallbackJobSummaries([
      { ...baseDrawing, id: "drawing-primary", jobId: "job-1", jobRole: "PRIMARY" },
      { ...baseDrawing, id: "drawing-secondary", name: "Job Alpha Alt", jobId: "job-1", jobRole: "SECONDARY", updatedAtIso: "2026-03-27T11:00:00.000Z" }
    ]);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe("job-1");
    expect(jobs[0]?.primaryDrawingId).toBe("drawing-primary");
    expect(jobs[0]?.drawingCount).toBe(2);
    expect(jobs[0]?.lastActivityAtIso).toBe("2026-03-27T11:00:00.000Z");
  });

  it("opens the job workspace when the fallback drawing knows its job id", () => {
    const drawings = [{ ...baseDrawing, id: "drawing-primary", jobId: "job-1", jobRole: "PRIMARY" }] satisfies DrawingSummary[];
    const [job] = buildFallbackJobSummaries(drawings);

    expect(resolveJobWorkspaceTarget(job!, drawings)).toEqual({
      route: "job",
      query: { jobId: "job-1" }
    });
  });

  it("falls back to the editor when a legacy drawing has no job id", () => {
    const drawings = [{ ...baseDrawing, id: "legacy-drawing" }] satisfies DrawingSummary[];
    const [job] = buildFallbackJobSummaries(drawings);

    expect(resolveJobWorkspaceTarget(job!, drawings)).toEqual({
      route: "editor",
      query: { drawingId: "legacy-drawing" }
    });
  });

  it("only marks drawings without job ids as needing fallback behavior", () => {
    expect(hasLegacyJoblessDrawings([{ ...baseDrawing, id: "legacy-drawing" }])).toBe(true);
    expect(hasLegacyJoblessDrawings([{ ...baseDrawing, id: "job-drawing", jobId: "job-1", jobRole: "PRIMARY" }])).toBe(false);
  });
});
