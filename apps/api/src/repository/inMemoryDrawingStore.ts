import type {
  CustomerRecord,
  DrawingRecord,
  DrawingSummary,
  DrawingVersionRecord,
  DrawingVersionSource,
  JobRecord,
  JobTaskRecord,
  QuoteRecord
} from "@fence-estimator/contracts";

import { toDrawingSummary } from "./shared.js";
import type {
  CreateDrawingInput,
  DeleteDrawingInput,
  RestoreDrawingVersionInput,
  SetDrawingArchivedStateInput,
  SetDrawingStatusInput,
  StoredUser,
  UpdateDrawingInput
} from "./types.js";

export interface InMemoryDrawingState {
  customers: Map<string, CustomerRecord>;
  drawings: Map<string, DrawingRecord>;
  drawingVersions: Map<string, DrawingVersionRecord[]>;
  jobs: Map<string, JobRecord>;
  jobTasks: Map<string, JobTaskRecord[]>;
  quotesByJobId: Map<string, QuoteRecord[]>;
  users: Map<string, StoredUser>;
}

export class InMemoryDrawingStore {
  public constructor(private readonly state: InMemoryDrawingState) {}

  private appendVersionRecord(
    drawing: DrawingRecord,
    source: DrawingVersionSource,
    createdByUserId: string,
    createdAtIso: string,
  ): void {
    const versions = this.state.drawingVersions.get(drawing.id) ?? [];
    versions.push({
      id: `${drawing.id}:${drawing.versionNumber}`,
      drawingId: drawing.id,
      companyId: drawing.companyId,
      schemaVersion: drawing.schemaVersion,
      rulesVersion: drawing.rulesVersion,
      versionNumber: drawing.versionNumber,
      source,
      name: drawing.name,
      customerId: drawing.customerId,
      customerName: drawing.customerName,
      layout: drawing.layout,
      ...(drawing.savedViewport ? { savedViewport: drawing.savedViewport } : {}),
      estimate: drawing.estimate,
      createdByUserId,
      createdAtIso
    });
    this.state.drawingVersions.set(drawing.id, versions);
  }

  private resolveCurrentDrawing(drawing: DrawingRecord): DrawingRecord {
    if (!drawing.customerId) {
      return drawing;
    }
    const customer = this.state.customers.get(drawing.customerId);
    if (!customer) {
      return drawing;
    }
    return {
      ...drawing,
      customerName: customer.name,
    };
  }

  private toSummary(drawing: DrawingRecord): DrawingSummary {
    const resolvedDrawing = this.resolveCurrentDrawing(drawing);
    const versions = this.state.drawingVersions.get(drawing.id) ?? [];
    const contributorUserIds = [...new Set([
      resolvedDrawing.createdByUserId,
      resolvedDrawing.updatedByUserId,
      ...versions.map((version) => version.createdByUserId)
    ])];

    return toDrawingSummary(resolvedDrawing, {
      createdByDisplayName: this.state.users.get(resolvedDrawing.createdByUserId)?.displayName ?? "",
      updatedByDisplayName: this.state.users.get(resolvedDrawing.updatedByUserId)?.displayName ?? "",
      contributorUserIds,
      contributorDisplayNames: contributorUserIds
        .map((userId) => this.state.users.get(userId)?.displayName)
        .filter((displayName): displayName is string => typeof displayName === "string" && displayName.length > 0)
    });
  }

  public createDrawing(input: CreateDrawingInput): DrawingRecord {
    const workspaceId = input.workspaceId ?? input.jobId ?? null;
    const drawing: DrawingRecord = {
      ...input,
      workspaceId,
      revisionNumber: input.revisionNumber ?? 0,
      versionNumber: 1,
      status: "DRAFT",
      isArchived: false,
      archivedAtIso: null,
      archivedByUserId: null,
      statusChangedAtIso: null,
      statusChangedByUserId: null
    };
    this.state.drawings.set(drawing.id, drawing);
    this.appendVersionRecord(drawing, "CREATE", drawing.createdByUserId, drawing.createdAtIso);
    return drawing;
  }

  public listDrawings(companyId: string, scope: "ALL" | "ACTIVE" | "ARCHIVED" = "ACTIVE", search = "") {
    const normalized = search.trim().toLowerCase();
    return [...this.state.drawings.values()]
      .filter((drawing) => drawing.companyId === companyId)
      .filter((drawing) => {
        if (scope === "ACTIVE") {
          return !drawing.isArchived;
        }
        if (scope === "ARCHIVED") {
          return drawing.isArchived;
        }
        return true;
      })
      .filter((drawing) => {
        if (!normalized) {
          return true;
        }
        const customer = drawing.customerId ? this.state.customers.get(drawing.customerId) : null;
        const customerName = customer?.name ?? drawing.customerName;
        return drawing.name.toLowerCase().includes(normalized) || customerName.toLowerCase().includes(normalized);
      })
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso))
      .map((drawing) => this.toSummary(drawing));
  }

  public listDrawingsForCustomer(customerId: string, companyId: string): DrawingSummary[] {
    return [...this.state.drawings.values()]
      .filter((drawing) => drawing.companyId === companyId && drawing.customerId === customerId)
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso))
      .map((drawing) => this.toSummary(drawing));
  }

  public listDrawingsForJob(jobId: string, companyId: string): DrawingSummary[] {
    return [...this.state.drawings.values()]
      .filter((drawing) => drawing.companyId === companyId && drawing.workspaceId === jobId)
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso))
      .map((drawing) => this.toSummary(drawing));
  }

  public deleteDrawing(input: DeleteDrawingInput): boolean {
    const existing = this.state.drawings.get(input.drawingId);
    if (!existing || existing.companyId !== input.companyId) {
      return false;
    }
    this.state.drawings.delete(input.drawingId);
    this.state.drawingVersions.delete(input.drawingId);
    if (existing.workspaceId) {
      const remaining = [...this.state.drawings.values()]
        .filter((drawing) => drawing.companyId === input.companyId && drawing.workspaceId === existing.workspaceId)
        .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
      if (remaining.length === 0) {
        this.state.jobTasks.delete(existing.workspaceId);
        this.state.quotesByJobId.delete(existing.workspaceId);
        this.state.jobs.delete(existing.workspaceId);
      } else {
        const nextPrimaryId = remaining[0]?.id ?? null;
        for (const drawing of remaining) {
          this.state.drawings.set(drawing.id, {
            ...drawing,
            jobRole: drawing.id === nextPrimaryId ? "PRIMARY" : "SECONDARY"
          });
        }
        const job = this.state.jobs.get(existing.workspaceId);
        if (job) {
          this.state.jobs.set(existing.workspaceId, {
            ...job,
            primaryDrawingId: nextPrimaryId
          });
        }
      }
    }
    return true;
  }

  public getDrawingById(drawingId: string, companyId: string): DrawingRecord | null {
    const drawing = this.state.drawings.get(drawingId);
    if (!drawing || drawing.companyId !== companyId) {
      return null;
    }
    return this.resolveCurrentDrawing(drawing);
  }

  public updateDrawing(input: UpdateDrawingInput): DrawingRecord | null {
    const existing = this.state.drawings.get(input.drawingId);
    if (!existing || existing.companyId !== input.companyId) {
      return null;
    }
    if (existing.versionNumber !== input.expectedVersionNumber) {
      return null;
    }
    const workspaceId = input.workspaceId ?? input.jobId ?? existing.workspaceId ?? null;
    const updated: DrawingRecord = {
      ...existing,
      workspaceId,
      name: input.name,
      customerId: input.customerId,
      customerName: input.customerName,
      layout: input.layout,
      savedViewport: input.savedViewport ?? null,
      estimate: input.estimate,
      schemaVersion: input.schemaVersion,
      rulesVersion: input.rulesVersion,
      versionNumber: existing.versionNumber + 1,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso
    };
    this.state.drawings.set(updated.id, updated);
    this.appendVersionRecord(updated, "UPDATE", input.updatedByUserId, input.updatedAtIso);
    return updated;
  }

  public setDrawingArchivedState(input: SetDrawingArchivedStateInput): DrawingRecord | null {
    const existing = this.state.drawings.get(input.drawingId);
    if (!existing || existing.companyId !== input.companyId) {
      return null;
    }
    if (existing.versionNumber !== input.expectedVersionNumber) {
      return null;
    }

    const updated: DrawingRecord = {
      ...existing,
      versionNumber: existing.versionNumber + 1,
      isArchived: input.archived,
      archivedAtIso: input.archived ? input.archivedAtIso : null,
      archivedByUserId: input.archived ? input.archivedByUserId : null,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso
    };
    this.state.drawings.set(updated.id, updated);
    this.appendVersionRecord(updated, "ARCHIVE", input.updatedByUserId, input.updatedAtIso);
    return updated;
  }

  public setDrawingStatus(input: SetDrawingStatusInput): DrawingRecord | null {
    const existing = this.state.drawings.get(input.drawingId);
    if (!existing || existing.companyId !== input.companyId) {
      return null;
    }
    if (existing.versionNumber !== input.expectedVersionNumber) {
      return null;
    }

    const updated: DrawingRecord = {
      ...existing,
      versionNumber: existing.versionNumber + 1,
      status: input.status,
      statusChangedAtIso: input.statusChangedAtIso,
      statusChangedByUserId: input.statusChangedByUserId,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso
    };
    this.state.drawings.set(updated.id, updated);
    this.appendVersionRecord(updated, "STATUS", input.updatedByUserId, input.updatedAtIso);
    return updated;
  }

  public listDrawingVersions(drawingId: string, companyId: string): DrawingVersionRecord[] {
    const versions = this.state.drawingVersions.get(drawingId) ?? [];
    return versions.filter((version) => version.companyId === companyId).slice().sort((a, b) => b.versionNumber - a.versionNumber);
  }

  public restoreDrawingVersion(input: RestoreDrawingVersionInput): DrawingRecord | null {
    const existing = this.state.drawings.get(input.drawingId);
    if (!existing || existing.companyId !== input.companyId) {
      return null;
    }
    if (existing.versionNumber !== input.expectedVersionNumber) {
      return null;
    }
    const version = (this.state.drawingVersions.get(input.drawingId) ?? []).find((entry) => entry.versionNumber === input.versionNumber);
    if (!version) {
      return null;
    }
    const restored: DrawingRecord = {
      ...existing,
      name: version.name,
      customerId: version.customerId,
      customerName: version.customerName,
      layout: version.layout,
      savedViewport: version.savedViewport ?? null,
      estimate: version.estimate,
      schemaVersion: version.schemaVersion,
      rulesVersion: version.rulesVersion,
      versionNumber: existing.versionNumber + 1,
      updatedByUserId: input.restoredByUserId,
      updatedAtIso: input.restoredAtIso
    };
    this.state.drawings.set(restored.id, restored);
    this.appendVersionRecord(restored, "RESTORE", input.restoredByUserId, input.restoredAtIso);
    return restored;
  }
}
