import type {
  AuditLogRecord,
  AuthSessionEnvelope,
  CompanyUserRecord,
  DrawingRecord,
  DrawingSummary
} from "@fence-estimator/contracts";

import { listAuditLog, listDrawings, listUsers } from "./apiClient";

export interface PortalCompanyData {
  drawings: DrawingSummary[];
  users: CompanyUserRecord[];
  auditLog: AuditLogRecord[];
}

export const EMPTY_PORTAL_COMPANY_DATA: PortalCompanyData = {
  drawings: [],
  users: [],
  auditLog: []
};

export function sessionCanManageCompanyData(session: AuthSessionEnvelope): boolean {
  return session.user.role === "OWNER" || session.user.role === "ADMIN";
}

export async function loadPortalCompanyData(session: AuthSessionEnvelope): Promise<PortalCompanyData> {
  const canManage = sessionCanManageCompanyData(session);
  const [drawings, users, auditLog] = await Promise.all([
    listDrawings(),
    canManage ? listUsers() : Promise.resolve([]),
    canManage ? listAuditLog() : Promise.resolve([])
  ]);

  return {
    drawings,
    users,
    auditLog
  };
}

export function updateDrawingSummaryFromRecord(drawing: DrawingRecord): DrawingSummary {
  return {
    id: drawing.id,
    companyId: drawing.companyId,
    name: drawing.name,
    previewLayout: drawing.layout,
    segmentCount: drawing.layout.segments.length,
    gateCount: drawing.layout.gates?.length ?? 0,
    schemaVersion: drawing.schemaVersion,
    rulesVersion: drawing.rulesVersion,
    versionNumber: drawing.versionNumber,
    isArchived: drawing.isArchived,
    archivedAtIso: drawing.archivedAtIso,
    archivedByUserId: drawing.archivedByUserId,
    createdByUserId: drawing.createdByUserId,
    updatedByUserId: drawing.updatedByUserId,
    createdAtIso: drawing.createdAtIso,
    updatedAtIso: drawing.updatedAtIso
  };
}
