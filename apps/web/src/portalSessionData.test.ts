import { describe, expect, it } from "vitest";

import { sessionCanManageCompanyData, updateDrawingSummaryFromRecord } from "./portalSessionData.js";

describe("portalSessionData", () => {
  it("identifies sessions that can manage company data", () => {
    expect(
      sessionCanManageCompanyData({
        company: { id: "company-1", name: "Acme", createdAtIso: "2025-01-01T00:00:00.000Z" },
        user: {
          id: "user-1",
          companyId: "company-1",
          email: "owner@example.com",
          displayName: "Owner",
          role: "OWNER",
          createdAtIso: "2025-01-01T00:00:00.000Z"
        },
        session: {
          id: "session-1",
          companyId: "company-1",
          userId: "user-1",
          createdAtIso: "2025-01-01T00:00:00.000Z",
          expiresAtIso: "2025-01-02T00:00:00.000Z",
          revokedAtIso: null
        }
      }),
    ).toBe(true);
  });

  it("maps a drawing record into a drawing summary", () => {
    const summary = updateDrawingSummaryFromRecord({
      id: "drawing-1",
      companyId: "company-1",
      name: "Perimeter",
      layout: {
        segments: [
          {
            id: "segment-1",
            start: { x: 0, y: 0 },
            end: { x: 1000, y: 0 },
            spec: { system: "TWIN_BAR", height: "2m" }
          }
        ],
        gates: [
          {
            id: "gate-1",
            segmentId: "segment-1",
            startOffsetMm: 100,
            endOffsetMm: 200,
            gateType: "SINGLE_LEAF"
          }
        ]
      },
      estimate: {} as never,
      schemaVersion: 1,
      rulesVersion: "1.0.0",
      versionNumber: 2,
      isArchived: false,
      archivedAtIso: null,
      archivedByUserId: null,
      createdByUserId: "user-1",
      updatedByUserId: "user-1",
      createdAtIso: "2025-01-01T00:00:00.000Z",
      updatedAtIso: "2025-01-01T00:00:00.000Z"
    });

    expect(summary.segmentCount).toBe(1);
    expect(summary.gateCount).toBe(1);
    expect(summary.previewLayout.gates?.[0]?.id).toBe("gate-1");
  });
});
