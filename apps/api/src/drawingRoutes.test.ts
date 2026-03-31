import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { InMemoryAppRepository } from "./repository.js";
import { getCookieHeader, registerAndGetSession } from "./testSupport.js";

async function createCustomerForSession(app: Awaited<ReturnType<typeof registerAndGetSession>>["app"], cookieHeader: { cookie: string }) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/customers",
    headers: cookieHeader,
    payload: {
      name: "Cleveland Land Services"
    }
  });

  expect(response.statusCode).toBe(201);
  return response.json<{ customer: { id: string } }>().customer.id;
}

describe("API drawing routes", { timeout: 10000 }, () => {
  it("returns estimate for valid layout", async () => {
    const { app, cookieHeader } = await registerAndGetSession();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/estimate",
      headers: cookieHeader,
      payload: {
        segments: [
          {
            id: "one",
            start: { x: 0, y: 0 },
            end: { x: 10000, y: 0 },
            spec: { system: "TWIN_BAR", height: "2m" }
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ estimate: { materials: { twinBarPanels: number } } }>().estimate.materials.twinBarPanels).toBe(4);
    await app.close();
  });

  it("creates, lists, loads, and updates drawings for the authenticated company", async () => {
    const { app, cookieHeader } = await registerAndGetSession();
    const customerId = await createCustomerForSession(app, cookieHeader);

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: cookieHeader,
      payload: {
        name: "Yard perimeter",
        customerId,
        layout: {
          segments: [
            {
              id: "one",
              start: { x: 0.4, y: 0.2 },
              end: { x: 10000.6, y: 0.8 },
              spec: { system: "TWIN_BAR", height: "2m" }
            }
          ],
          gates: [
            {
              id: "gate-1",
              segmentId: "one",
              startOffsetMm: 4000.2,
              endOffsetMm: 5200.6,
              gateType: "SINGLE_LEAF"
            }
          ]
        },
        savedViewport: {
          x: 320,
          y: 180,
          scale: 0.27
        }
      }
    });
    expect(create.statusCode).toBe(201);
    const createdBody = create.json<{
      drawing: {
        id: string;
        versionNumber: number;
        savedViewport?: { x: number; y: number; scale: number } | null;
        layout: {
          segments: Array<{ end: { x: number; y: number } }>;
          gates: Array<{ startOffsetMm: number; endOffsetMm: number }>;
        };
        estimate: { posts: { total: number } };
      };
    }>();
    const drawingId = createdBody.drawing.id;
    expect(createdBody.drawing.layout.gates[0]).toMatchObject({
      startOffsetMm: 4000,
      endOffsetMm: 5201
    });
    expect(createdBody.drawing.estimate.posts.total).toBe(6);
    expect(createdBody.drawing.versionNumber).toBe(1);
    expect(createdBody.drawing.savedViewport).toEqual({ x: 320, y: 180, scale: 0.27 });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/drawings",
      headers: cookieHeader
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ drawings: Array<{ id: string }> }>().drawings[0]?.id).toBe(drawingId);

    const load = await app.inject({
      method: "GET",
      url: `/api/v1/drawings/${drawingId}`,
      headers: cookieHeader
    });
    expect(load.statusCode).toBe(200);
    const loadedDrawing = load.json<{
      drawing: {
        savedViewport?: { x: number; y: number; scale: number } | null;
        layout: {
          segments: Array<{ end: { x: number; y: number } }>;
          gates: Array<{ startOffsetMm: number; endOffsetMm: number }>;
        };
      };
    }>().drawing;
    expect(loadedDrawing.layout.segments[0]?.end).toEqual({
      x: 10001,
      y: 1
    });
    expect(loadedDrawing.layout.gates[0]).toMatchObject({
      startOffsetMm: 4000,
      endOffsetMm: 5201
    });
    expect(loadedDrawing.savedViewport).toEqual({ x: 320, y: 180, scale: 0.27 });

    const update = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${drawingId}`,
      headers: cookieHeader,
      payload: {
        expectedVersionNumber: 1,
        name: "Updated yard perimeter",
        savedViewport: {
          x: 640,
          y: 260,
          scale: 0.42
        }
      }
    });
    expect(update.statusCode).toBe(200);
    const updatedDrawing = update.json<{
      drawing: { name: string; versionNumber: number; savedViewport?: { x: number; y: number; scale: number } | null };
    }>().drawing;
    expect(updatedDrawing.name).toBe("Updated yard perimeter");
    expect(updatedDrawing.versionNumber).toBe(2);
    expect(updatedDrawing.savedViewport).toEqual({ x: 640, y: 260, scale: 0.42 });

    const versions = await app.inject({
      method: "GET",
      url: `/api/v1/drawings/${drawingId}/versions`,
      headers: cookieHeader
    });
    expect(versions.statusCode).toBe(200);
    expect(versions.json<{ versions: Array<{ versionNumber: number }> }>().versions).toHaveLength(2);
    await app.close();
  });

  it("preserves new feature attachments when drawings are created", async () => {
    const { app, cookieHeader } = await registerAndGetSession();
    const customerId = await createCustomerForSession(app, cookieHeader);

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: cookieHeader,
      payload: {
        name: "Feature-rich drawing",
        customerId,
        layout: {
          segments: [
            {
              id: "one",
              start: { x: 0.4, y: 0.2 },
              end: { x: 12000.6, y: 0.8 },
              spec: { system: "TWIN_BAR", height: "3m" }
            },
            {
              id: "two",
              start: { x: 0.1, y: 8000.2 },
              end: { x: 12000.3, y: 8000.7 },
              spec: { system: "TWIN_BAR", height: "3m" }
            }
          ],
          goalUnits: [
            {
              id: "goal-1",
              segmentId: "one",
              centerOffsetMm: 6000.4,
              side: "LEFT",
              widthMm: 3000,
              depthMm: 1200.3,
              goalHeightMm: 3000
            }
          ],
          kickboards: [
            {
              id: "kick-1",
              segmentId: "one",
              sectionHeightMm: 225,
              thicknessMm: 50,
              profile: "CHAMFERED",
              boardLengthMm: 2500
            }
          ],
          pitchDividers: [
            {
              id: "divider-1",
              startAnchor: { segmentId: "one", offsetMm: 2000.4 },
              endAnchor: { segmentId: "two", offsetMm: 9000.6 }
            }
          ],
          sideNettings: [
            {
              id: "net-1",
              segmentId: "one",
              additionalHeightMm: 1999.6,
              extendedPostInterval: 3,
              startOffsetMm: 2500.4
            },
            {
              id: "net-2",
              segmentId: "two",
              additionalHeightMm: 1200.2,
              extendedPostInterval: 3,
              endOffsetMm: 7500.8
            }
          ]
        }
      }
    });

    expect(create.statusCode).toBe(201);
    const createdLayout = create.json<{
      drawing: {
        id: string;
        layout: {
          goalUnits: Array<{ centerOffsetMm: number; depthMm: number }>;
          kickboards: Array<{ profile: string }>;
          pitchDividers: Array<{ startAnchor: { offsetMm: number }; endAnchor: { offsetMm: number } }>;
          sideNettings: Array<{
            additionalHeightMm: number;
            startOffsetMm?: number;
            endOffsetMm?: number;
          }>;
        };
      };
    }>().drawing;

    expect(createdLayout.layout.goalUnits[0]).toMatchObject({
      centerOffsetMm: 6000,
      depthMm: 1200
    });
    expect(createdLayout.layout.kickboards[0]).toMatchObject({
      profile: "CHAMFERED"
    });
    expect(createdLayout.layout.pitchDividers[0]).toMatchObject({
      startAnchor: { offsetMm: 2000 },
      endAnchor: { offsetMm: 9001 }
    });
    expect(createdLayout.layout.sideNettings).toEqual([
      expect.objectContaining({
        additionalHeightMm: 2000,
        startOffsetMm: 2500
      }),
      expect.objectContaining({
        additionalHeightMm: 1200,
        endOffsetMm: 7501
      })
    ]);
    expect("endOffsetMm" in createdLayout.layout.sideNettings[0]!).toBe(false);
    expect("startOffsetMm" in createdLayout.layout.sideNettings[1]!).toBe(false);

    const load = await app.inject({
      method: "GET",
      url: `/api/v1/drawings/${createdLayout.id}`,
      headers: cookieHeader
    });

    expect(load.statusCode).toBe(200);
    const loadedLayout = load.json<{
      drawing: {
        layout: {
          goalUnits: Array<{ id: string }>;
          kickboards: Array<{ id: string }>;
          pitchDividers: Array<{ id: string }>;
          sideNettings: Array<{ id: string }>;
        };
      };
    }>().drawing.layout;
    expect(loadedLayout.goalUnits.map((goalUnit) => goalUnit.id)).toEqual(["goal-1"]);
    expect(loadedLayout.kickboards.map((kickboard) => kickboard.id)).toEqual(["kick-1"]);
    expect(loadedLayout.pitchDividers.map((pitchDivider) => pitchDivider.id)).toEqual(["divider-1"]);
    expect(loadedLayout.sideNettings.map((sideNetting) => sideNetting.id)).toEqual(["net-1", "net-2"]);

    await app.close();
  });

  it("returns a server-priced estimate with pricing snapshot metadata", async () => {
    const { app, cookieHeader } = await registerAndGetSession();
    const customerId = await createCustomerForSession(app, cookieHeader);

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: cookieHeader,
      payload: {
        name: "Priced estimate test",
        customerId,
        layout: {
          segments: [
            {
              id: "one",
              start: { x: 0, y: 0 },
              end: { x: 5050, y: 0 },
              spec: { system: "TWIN_BAR", height: "2m" }
            }
          ],
          gates: []
        }
      }
    });
    expect(create.statusCode).toBe(201);
    const drawingId = create.json<{ drawing: { id: string } }>().drawing.id;

    const pricedEstimate = await app.inject({
      method: "GET",
      url: `/api/v1/drawings/${drawingId}/priced-estimate`,
      headers: cookieHeader
    });

    expect(pricedEstimate.statusCode).toBe(200);
    expect(pricedEstimate.json<{
      pricedEstimate: {
        drawing: { drawingId: string };
        groups: Array<{ key: string }>;
        pricingSnapshot: { source: string };
      };
    }>().pricedEstimate).toMatchObject({
      drawing: { drawingId },
      pricingSnapshot: { source: "DEFAULT" }
    });
    expect(
      pricedEstimate.json<{ pricedEstimate: { groups: Array<{ key: string }> } }>().pricedEstimate.groups.map((group) => group.key)
    ).toContain("panels");

    await app.close();
  });

  it("creates and lists immutable quote snapshots for a drawing", async () => {
    const { app, cookieHeader } = await registerAndGetSession();
    const customerId = await createCustomerForSession(app, cookieHeader);

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: cookieHeader,
      payload: {
        name: "Quoted yard",
        customerId,
        layout: {
          segments: [
            {
              id: "one",
              start: { x: 0, y: 0 },
              end: { x: 5050, y: 0 },
              spec: { system: "TWIN_BAR", height: "2m" }
            }
          ],
          gates: []
        }
      }
    });
    expect(create.statusCode).toBe(201);
    const drawingId = create.json<{ drawing: { id: string } }>().drawing.id;

    const quoteCreate = await app.inject({
      method: "POST",
      url: `/api/v1/drawings/${drawingId}/quotes`,
      headers: cookieHeader,
      payload: {
        ancillaryItems: [
          {
            id: "ancillary-1",
            description: "Lift hire",
            quantity: 1,
            materialCost: 50,
            labourCost: 10
          }
        ]
      }
    });

    expect(quoteCreate.statusCode).toBe(201);
    const createdQuote = quoteCreate.json<{
      quote: {
        drawingId: string;
        drawingVersionNumber: number;
        drawingSnapshot: { revisionNumber?: number };
        pricedEstimate: { ancillaryItems: Array<{ description: string }>; totals: { totalCost: number } };
      };
    }>().quote;
    expect(createdQuote.drawingId).toBe(drawingId);
    expect(createdQuote.drawingVersionNumber).toBe(1);
    expect(createdQuote.drawingSnapshot.revisionNumber).toBe(0);
    expect(createdQuote.pricedEstimate.ancillaryItems[0]?.description).toBe("Lift hire");

    const quotedDrawing = await app.inject({
      method: "GET",
      url: `/api/v1/drawings/${drawingId}`,
      headers: cookieHeader
    });

    expect(quotedDrawing.statusCode).toBe(200);
    expect(quotedDrawing.json<{ drawing: { status: string } }>().drawing.status).toBe("QUOTED");

    const quotedUpdate = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${drawingId}`,
      headers: cookieHeader,
      payload: {
        expectedVersionNumber: 2,
        name: "Quoted yard revised"
      }
    });

    expect(quotedUpdate.statusCode).toBe(200);
    expect(quotedUpdate.json<{ drawing: { name: string; versionNumber: number } }>().drawing).toMatchObject({
      name: "Quoted yard revised",
      versionNumber: 3
    });

    const quoteList = await app.inject({
      method: "GET",
      url: `/api/v1/drawings/${drawingId}/quotes`,
      headers: cookieHeader
    });

    expect(quoteList.statusCode).toBe(200);
    expect(quoteList.json<{ quotes: Array<{ drawingVersionNumber: number }> }>().quotes).toEqual([
      expect.objectContaining({ drawingVersionNumber: 1 })
    ]);

    await app.close();
  });

  it("rejects stale drawing updates with a version conflict", async () => {
    const { app, cookieHeader } = await registerAndGetSession();
    const customerId = await createCustomerForSession(app, cookieHeader);

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: cookieHeader,
      payload: {
        name: "Conflict test",
        customerId,
        layout: { segments: [] }
      }
    });
    expect(create.statusCode).toBe(201);
    const drawingId = create.json<{ drawing: { id: string } }>().drawing.id;

    const update = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${drawingId}`,
      headers: cookieHeader,
      payload: {
        expectedVersionNumber: 1,
        name: "Conflict test v2"
      }
    });
    expect(update.statusCode).toBe(200);

    const staleUpdate = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${drawingId}`,
      headers: cookieHeader,
      payload: {
        expectedVersionNumber: 1,
        name: "Conflict test stale"
      }
    });

    expect(staleUpdate.statusCode).toBe(409);
    expect(staleUpdate.json<{ details: { currentVersionNumber: number } }>().details.currentVersionNumber).toBe(2);
    await app.close();
  });

  it("archives drawings, exposes audit log, and supports logout", async () => {
    const { app, cookieHeader } = await registerAndGetSession();
    const customerId = await createCustomerForSession(app, cookieHeader);

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/drawings",
      headers: cookieHeader,
      payload: {
        name: "Archive me",
        customerId,
        layout: { segments: [] }
      }
    });
    const drawingId = create.json<{ drawing: { id: string } }>().drawing.id;

    const archive = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${drawingId}/archive`,
      headers: cookieHeader,
      payload: {
        archived: true,
        expectedVersionNumber: 1
      }
    });

    expect(archive.statusCode).toBe(200);
    expect(archive.json<{ drawing: { isArchived: boolean } }>().drawing.isArchived).toBe(true);

    const audit = await app.inject({
      method: "GET",
      url: "/api/v1/audit-log?limit=10",
      headers: cookieHeader
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json<{ entries: Array<{ action: string }> }>().entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "DRAWING_ARCHIVED" })]),
    );

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: cookieHeader
    });
    expect(logout.statusCode).toBe(200);
    expect(getCookieHeader(logout).cookie).toContain("fence_estimator_session=");

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: cookieHeader
    });
    expect(me.statusCode).toBe(401);
    await app.close();
  });

  it("allows admins to permanently delete jobs and removes them from follow-up loads", async () => {
    const { app, cookieHeader } = await registerAndGetSession();
    const customerId = await createCustomerForSession(app, cookieHeader);

    const createJob = await app.inject({
      method: "POST",
      url: "/api/v1/drawing-workspaces",
      headers: cookieHeader,
      payload: {
        customerId,
        name: "Delete me",
        notes: ""
      }
    });

    expect(createJob.statusCode).toBe(201);
    const jobId = createJob.json<{ workspace: { id: string } }>().workspace.id;

    const removeJob = await app.inject({
      method: "DELETE",
      url: `/api/v1/drawing-workspaces/${jobId}`,
      headers: cookieHeader
    });

    expect(removeJob.statusCode).toBe(409);

    const archiveJob = await app.inject({
      method: "PUT",
      url: `/api/v1/drawing-workspaces/${jobId}`,
      headers: cookieHeader,
      payload: {
        archived: true
      }
    });

    expect(archiveJob.statusCode).toBe(200);

    const removeArchivedJob = await app.inject({
      method: "DELETE",
      url: `/api/v1/drawing-workspaces/${jobId}`,
      headers: cookieHeader
    });

    expect(removeArchivedJob.statusCode).toBe(200);
    expect(removeArchivedJob.json<{ deleted: boolean }>().deleted).toBe(true);

    const loadDeletedJob = await app.inject({
      method: "GET",
      url: `/api/v1/drawing-workspaces/${jobId}`,
      headers: cookieHeader
    });

    expect(loadDeletedJob.statusCode).toBe(404);

    const listWorkspaces = await app.inject({
      method: "GET",
      url: "/api/v1/drawing-workspaces?scope=ALL",
      headers: cookieHeader
    });

    expect(listWorkspaces.statusCode).toBe(200);
    expect(
      listWorkspaces
        .json<{ workspaces: Array<{ id: string }> }>()
        .workspaces.some((workspace) => workspace.id === jobId),
    ).toBe(false);

    await app.close();
  });

  it("filters stale placeholder jobs after drawings move under a real job", async () => {
    const repository = new InMemoryAppRepository();
    const app = buildApp({ repository });

    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/v1/setup/bootstrap-owner",
      payload: {
        companyName: "Acme Fencing",
        displayName: "Jane Doe",
        email: "jane@example.com",
        password: "supersecure123"
      }
    });
    expect(bootstrap.statusCode).toBe(201);
    const cookieHeader = getCookieHeader(bootstrap);
    const customerId = await createCustomerForSession(app, cookieHeader);

    const createJob = await app.inject({
      method: "POST",
      url: "/api/v1/drawing-workspaces",
      headers: cookieHeader,
      payload: {
        customerId,
        name: "PSG Home ground",
        notes: ""
      }
    });

    expect(createJob.statusCode).toBe(201);
    const createdJobResponse = createJob.json<{
      workspace: Record<string, unknown> & {
        id: string;
        primaryDrawingId: string | null;
        name: string;
      };
    }>();
    const createdJob = createdJobResponse.workspace;
    expect(createdJob.primaryDrawingId).not.toBeNull();
    const primaryDrawingId = createdJob.primaryDrawingId!;

    const renamePrimaryDrawing = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${primaryDrawingId}`,
      headers: cookieHeader,
      payload: {
        expectedVersionNumber: 1,
        name: "Football pitch"
      }
    });
    expect(renamePrimaryDrawing.statusCode).toBe(200);

    const createRevision = await app.inject({
      method: "POST",
      url: `/api/v1/drawing-workspaces/${createdJob.id}/drawings`,
      headers: cookieHeader,
      payload: { sourceDrawingId: primaryDrawingId }
    });
    expect(createRevision.statusCode).toBe(201);
    const revisionDrawing = createRevision.json<{ drawing: { id: string; name: string } }>().drawing;

    const jobsMap = (repository as unknown as { jobsMap: Map<string, Record<string, unknown>> }).jobsMap;
    const placeholderRows = [
      { drawingId: primaryDrawingId, name: "Football pitch", updatedAtIso: "2026-03-28T16:03:50.523Z" },
      { drawingId: revisionDrawing.id, name: revisionDrawing.name, updatedAtIso: "2026-03-28T14:00:43.396Z" }
    ];

    for (const placeholder of placeholderRows) {
      jobsMap.set(`job:${placeholder.drawingId}`, {
        ...createdJob,
        id: `job:${placeholder.drawingId}`,
        name: placeholder.name,
        primaryDrawingId: placeholder.drawingId,
        updatedAtIso: placeholder.updatedAtIso
      });
    }

    const params = new URLSearchParams({ scope: "ALL", customerId });
    const listWorkspaces = await app.inject({
      method: "GET",
      url: `/api/v1/drawing-workspaces?${params.toString()}`,
      headers: cookieHeader
    });

    expect(listWorkspaces.statusCode).toBe(200);
    const workspaces = listWorkspaces
      .json<{ workspaces: Array<{ id: string; name: string }> }>()
      .workspaces;
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toMatchObject({ id: createdJob.id, name: "Football pitch" });
    expect(workspaces.some((workspace) => workspace.id.startsWith("job:"))).toBe(false);

    await app.close();
  });

  it("requires a source drawing when creating a revision inside an existing workspace", async () => {
    const { app, cookieHeader } = await registerAndGetSession();
    const customerId = await createCustomerForSession(app, cookieHeader);

    const createJob = await app.inject({
      method: "POST",
      url: "/api/v1/drawing-workspaces",
      headers: cookieHeader,
      payload: {
        customerId,
        name: "North boundary",
        notes: ""
      }
    });

    expect(createJob.statusCode).toBe(201);
    const createdJob = createJob.json<{ workspace: { id: string } }>().workspace;

    const createRevisionWithoutSource = await app.inject({
      method: "POST",
      url: `/api/v1/drawing-workspaces/${createdJob.id}/drawings`,
      headers: cookieHeader,
      payload: {}
    });

    expect(createRevisionWithoutSource.statusCode).toBe(400);
    expect(createRevisionWithoutSource.json<{ error: string }>().error).toBe(
      "A source drawing is required when creating a revision.",
    );

    await app.close();
  });

  it("keeps the workspace name tied to the drawing chain name", async () => {
    const { app, cookieHeader } = await registerAndGetSession();
    const customerId = await createCustomerForSession(app, cookieHeader);

    const createJob = await app.inject({
      method: "POST",
      url: "/api/v1/drawing-workspaces",
      headers: cookieHeader,
      payload: {
        customerId,
        name: "North boundary",
        notes: ""
      }
    });

    expect(createJob.statusCode).toBe(201);
    const createdJob = createJob
      .json<{ workspace: { id: string; primaryDrawingId: string } }>()
      .workspace;

    const createRevision = await app.inject({
      method: "POST",
      url: `/api/v1/drawing-workspaces/${createdJob.id}/drawings`,
      headers: cookieHeader,
      payload: { sourceDrawingId: createdJob.primaryDrawingId }
    });
    expect(createRevision.statusCode).toBe(201);
    const revision = createRevision.json<{ drawing: { id: string; versionNumber: number } }>().drawing;

    const renameRevision = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${revision.id}`,
      headers: cookieHeader,
      payload: {
        expectedVersionNumber: revision.versionNumber,
        name: "Training ground"
      }
    });

    expect(renameRevision.statusCode).toBe(200);

    const loadJob = await app.inject({
      method: "GET",
      url: `/api/v1/drawing-workspaces/${createdJob.id}`,
      headers: cookieHeader
    });
    expect(loadJob.statusCode).toBe(200);
    expect(loadJob.json<{ workspace: { name: string } }>().workspace.name).toBe(
      "Training ground",
    );

    const loadDrawings = await app.inject({
      method: "GET",
      url: `/api/v1/drawing-workspaces/${createdJob.id}/drawings`,
      headers: cookieHeader
    });
    expect(loadDrawings.statusCode).toBe(200);
    expect(loadDrawings.json<{ drawings: Array<{ name: string }> }>().drawings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Training ground" }),
      ]),
    );
    expect(
      loadDrawings.json<{ drawings: Array<{ name: string }> }>().drawings.every((drawing) => drawing.name === "Training ground"),
    ).toBe(true);

    await app.close();
  });

  it("assigns revision numbers and only allows deleting the last archived revision", async () => {
    const { app, cookieHeader } = await registerAndGetSession();
    const customerId = await createCustomerForSession(app, cookieHeader);

    const createJob = await app.inject({
      method: "POST",
      url: "/api/v1/drawing-workspaces",
      headers: cookieHeader,
      payload: {
        customerId,
        name: "Revision chain",
        notes: ""
      }
    });

    expect(createJob.statusCode).toBe(201);
    const createdJob = createJob
      .json<{ workspace: { id: string; primaryDrawingId: string } }>()
      .workspace;
    const jobId = createdJob.id;
    const rootDrawingId = createdJob.primaryDrawingId;

    const revisionOneCreate = await app.inject({
      method: "POST",
      url: `/api/v1/drawing-workspaces/${jobId}/drawings`,
      headers: cookieHeader,
      payload: { sourceDrawingId: rootDrawingId }
    });
    expect(revisionOneCreate.statusCode).toBe(201);
    const revisionOneId = revisionOneCreate.json<{ drawing: { id: string; revisionNumber: number } }>().drawing.id;
    expect(revisionOneCreate.json<{ drawing: { revisionNumber: number } }>().drawing.revisionNumber).toBe(1);

    const revisionTwoCreate = await app.inject({
      method: "POST",
      url: `/api/v1/drawing-workspaces/${jobId}/drawings`,
      headers: cookieHeader,
      payload: { sourceDrawingId: revisionOneId }
    });
    expect(revisionTwoCreate.statusCode).toBe(201);
    const revisionTwoId = revisionTwoCreate.json<{ drawing: { id: string; revisionNumber: number } }>().drawing.id;
    expect(revisionTwoCreate.json<{ drawing: { revisionNumber: number } }>().drawing.revisionNumber).toBe(2);

    const jobDrawings = await app.inject({
      method: "GET",
      url: `/api/v1/drawing-workspaces/${jobId}/drawings`,
      headers: cookieHeader
    });

    expect(jobDrawings.statusCode).toBe(200);
    expect(jobDrawings.json<{ drawings: Array<{ id: string; revisionNumber: number }> }>().drawings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: rootDrawingId, revisionNumber: 0 }),
        expect.objectContaining({ id: revisionOneId, revisionNumber: 1 }),
        expect.objectContaining({ id: revisionTwoId, revisionNumber: 2 })
      ])
    );

    const archiveRevisionOne = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${revisionOneId}/archive`,
      headers: cookieHeader,
      payload: {
        expectedVersionNumber: 1,
        archived: true
      }
    });
    expect(archiveRevisionOne.statusCode).toBe(200);

    const deleteMiddleRevision = await app.inject({
      method: "DELETE",
      url: `/api/v1/drawings/${revisionOneId}/revision`,
      headers: cookieHeader
    });
    expect(deleteMiddleRevision.statusCode).toBe(400);
    expect(deleteMiddleRevision.json<{ error: string }>().error).toBe("Only the last revision can be deleted");

    const archiveRevisionTwo = await app.inject({
      method: "PUT",
      url: `/api/v1/drawings/${revisionTwoId}/archive`,
      headers: cookieHeader,
      payload: {
        expectedVersionNumber: 1,
        archived: true
      }
    });
    expect(archiveRevisionTwo.statusCode).toBe(200);

    const deleteLastRevision = await app.inject({
      method: "DELETE",
      url: `/api/v1/drawings/${revisionTwoId}/revision`,
      headers: cookieHeader
    });
    expect(deleteLastRevision.statusCode).toBe(200);

    await app.close();
  });

  it("rejects drawing access without a valid session", async () => {
    const app = buildApp({ repository: new InMemoryAppRepository() });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/drawings"
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects estimate access without a valid session", async () => {
    const app = buildApp({ repository: new InMemoryAppRepository() });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/estimate",
      payload: {
        segments: []
      }
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns and updates company pricing configuration", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const initial = await app.inject({
      method: "GET",
      url: "/api/v1/pricing-config",
      headers: cookieHeader
    });

    expect(initial.statusCode).toBe(200);
    const initialBody = initial.json<{ pricingConfig: { items: Array<{ itemCode: string; materialCost: number }> } }>();
    expect(initialBody.pricingConfig.items.find((item) => item.itemCode === "TWIN_BAR_GENERAL_PLANT")?.materialCost).toBe(700);

    const updatedItems = initialBody.pricingConfig.items.map((item) =>
      item.itemCode === "TWIN_BAR_GENERAL_PLANT" ? { ...item, materialCost: 850 } : item
    );

    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/pricing-config",
      headers: cookieHeader,
      payload: {
        items: updatedItems
      }
    });

    expect(update.statusCode).toBe(200);
    expect(update.json<{ pricingConfig: { items: Array<{ itemCode: string; materialCost: number }> } }>()
      .pricingConfig.items.find((item) => item.itemCode === "TWIN_BAR_GENERAL_PLANT")?.materialCost).toBe(850);

    await app.close();
  });

  it("rejects pricing configuration access for members while allowing admins", async () => {
    const { app, cookieHeader } = await registerAndGetSession();

    const createMember = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: cookieHeader,
      payload: {
        displayName: "Team Member",
        email: "member@example.com",
        password: "membersecure123",
        role: "MEMBER"
      }
    });
    expect(createMember.statusCode).toBe(201);

    const createAdmin = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: cookieHeader,
      payload: {
        displayName: "Ops Admin",
        email: "admin@example.com",
        password: "adminsecure123",
        role: "ADMIN"
      }
    });
    expect(createAdmin.statusCode).toBe(201);

    const memberLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "member@example.com",
        password: "membersecure123"
      }
    });
    expect(memberLogin.statusCode).toBe(200);
    const memberCookieHeader = getCookieHeader(memberLogin);

    const memberGet = await app.inject({
      method: "GET",
      url: "/api/v1/pricing-config",
      headers: memberCookieHeader
    });
    expect(memberGet.statusCode).toBe(403);

    const memberPut = await app.inject({
      method: "PUT",
      url: "/api/v1/pricing-config",
      headers: memberCookieHeader,
      payload: {
        items: []
      }
    });
    expect(memberPut.statusCode).toBe(403);

    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "admin@example.com",
        password: "adminsecure123"
      }
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminCookieHeader = getCookieHeader(adminLogin);

    const adminGet = await app.inject({
      method: "GET",
      url: "/api/v1/pricing-config",
      headers: adminCookieHeader
    });
    expect(adminGet.statusCode).toBe(200);

    await app.close();
  });
});
