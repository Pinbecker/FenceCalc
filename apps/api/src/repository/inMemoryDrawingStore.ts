import type { DrawingRecord, DrawingVersionRecord } from "@fence-estimator/contracts";

import { toDrawingSummary } from "./shared.js";
import type {
  CreateDrawingInput,
  RestoreDrawingVersionInput,
  SetDrawingArchivedStateInput,
  UpdateDrawingInput
} from "./types.js";

export interface InMemoryDrawingState {
  drawings: Map<string, DrawingRecord>;
  drawingVersions: Map<string, DrawingVersionRecord[]>;
}

export class InMemoryDrawingStore {
  public constructor(private readonly state: InMemoryDrawingState) {}

  public createDrawing(input: CreateDrawingInput): DrawingRecord {
    const drawing: DrawingRecord = {
      ...input,
      versionNumber: 1,
      isArchived: false,
      archivedAtIso: null,
      archivedByUserId: null
    };
    this.state.drawings.set(drawing.id, drawing);
    this.state.drawingVersions.set(drawing.id, [
      {
        id: `${drawing.id}:1`,
        drawingId: drawing.id,
        companyId: drawing.companyId,
        schemaVersion: drawing.schemaVersion,
        rulesVersion: drawing.rulesVersion,
        versionNumber: 1,
        source: "CREATE",
        name: drawing.name,
        layout: drawing.layout,
        ...(drawing.savedViewport ? { savedViewport: drawing.savedViewport } : {}),
        estimate: drawing.estimate,
        createdByUserId: drawing.createdByUserId,
        createdAtIso: drawing.createdAtIso
      }
    ]);
    return drawing;
  }

  public listDrawings(companyId: string, scope: "ALL" | "ACTIVE" | "ARCHIVED" = "ACTIVE") {
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
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso))
      .map(toDrawingSummary);
  }

  public getDrawingById(drawingId: string, companyId: string): DrawingRecord | null {
    const drawing = this.state.drawings.get(drawingId);
    if (!drawing || drawing.companyId !== companyId) {
      return null;
    }
    return drawing;
  }

  public updateDrawing(input: UpdateDrawingInput): DrawingRecord | null {
    const existing = this.state.drawings.get(input.drawingId);
    if (!existing || existing.companyId !== input.companyId) {
      return null;
    }
    const updated: DrawingRecord = {
      ...existing,
      name: input.name,
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
    const versions = this.state.drawingVersions.get(updated.id) ?? [];
    versions.push({
      id: `${updated.id}:${updated.versionNumber}`,
      drawingId: updated.id,
      companyId: updated.companyId,
      schemaVersion: updated.schemaVersion,
      rulesVersion: updated.rulesVersion,
      versionNumber: updated.versionNumber,
      source: "UPDATE",
      name: updated.name,
      layout: updated.layout,
      ...(updated.savedViewport ? { savedViewport: updated.savedViewport } : {}),
      estimate: updated.estimate,
      createdByUserId: input.updatedByUserId,
      createdAtIso: input.updatedAtIso
    });
    this.state.drawingVersions.set(updated.id, versions);
    return updated;
  }

  public setDrawingArchivedState(input: SetDrawingArchivedStateInput): DrawingRecord | null {
    const existing = this.state.drawings.get(input.drawingId);
    if (!existing || existing.companyId !== input.companyId) {
      return null;
    }

    const updated: DrawingRecord = {
      ...existing,
      isArchived: input.archived,
      archivedAtIso: input.archived ? input.archivedAtIso : null,
      archivedByUserId: input.archived ? input.archivedByUserId : null,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso
    };
    this.state.drawings.set(updated.id, updated);
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
    const version = (this.state.drawingVersions.get(input.drawingId) ?? []).find((entry) => entry.versionNumber === input.versionNumber);
    if (!version) {
      return null;
    }
    const restored: DrawingRecord = {
      ...existing,
      name: version.name,
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
    const versions = this.state.drawingVersions.get(restored.id) ?? [];
    versions.push({
      id: `${restored.id}:${restored.versionNumber}`,
      drawingId: restored.id,
      companyId: restored.companyId,
      schemaVersion: restored.schemaVersion,
      rulesVersion: restored.rulesVersion,
      versionNumber: restored.versionNumber,
      source: "RESTORE",
      name: restored.name,
      layout: restored.layout,
      ...(restored.savedViewport ? { savedViewport: restored.savedViewport } : {}),
      estimate: restored.estimate,
      createdByUserId: input.restoredByUserId,
      createdAtIso: input.restoredAtIso
    });
    this.state.drawingVersions.set(restored.id, versions);
    return restored;
  }
}
