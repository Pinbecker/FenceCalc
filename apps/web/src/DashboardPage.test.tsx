import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AuthSessionEnvelope, DrawingSummary } from "@fence-estimator/contracts";

import { DashboardPage } from "./DashboardPage.js";

const TEST_SCHEMA_VERSION = 1;
const TEST_RULES_VERSION = "2026-03-11";

const session: AuthSessionEnvelope = {
  company: {
    id: "company-1",
    name: "Acme Fencing",
    createdAtIso: "2026-03-10T10:00:00.000Z"
  },
  user: {
    id: "user-1",
    companyId: "company-1",
    email: "jane@example.com",
    displayName: "Jane Doe",
    role: "OWNER",
    createdAtIso: "2026-03-10T10:00:00.000Z"
  },
  session: {
    id: "session-1",
    companyId: "company-1",
    userId: "user-1",
    createdAtIso: "2026-03-10T10:00:00.000Z",
    expiresAtIso: "2026-04-10T10:00:00.000Z"
  }
};

const drawings: DrawingSummary[] = [
  {
    id: "drawing-1",
    companyId: "company-1",
    name: "Front perimeter",
    previewLayout: {
      segments: [
        {
          id: "segment-1",
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
        }
      ],
      gates: []
    },
    segmentCount: 8,
    gateCount: 1,
    schemaVersion: TEST_SCHEMA_VERSION,
    rulesVersion: TEST_RULES_VERSION,
    versionNumber: 3,
    isArchived: false,
    archivedAtIso: null,
    archivedByUserId: null,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAtIso: "2026-03-10T10:00:00.000Z",
    updatedAtIso: "2026-03-10T12:00:00.000Z"
  }
];

describe("DashboardPage", () => {
  it("renders recent drawing previews beside the drawing names", () => {
    const html = renderToStaticMarkup(
      <DashboardPage session={session} drawings={drawings} onNavigate={() => undefined} />
    );

    expect(html).toContain("Front perimeter");
    expect(html).toContain("Drawing preview for Front perimeter");
    expect(html).toContain("v3");
  });
});
