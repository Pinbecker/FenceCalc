import type {
  AuditLogRecord,
  AuthSessionEnvelope,
  CompanyUserRecord,
  CustomerSummary,
  DrawingRecord,
  DrawingSummary
} from "@fence-estimator/contracts";

import { listAuditLog, listCustomers, listDrawings, listUsers } from "./apiClient";

export interface PortalCompanyData {
  customers: CustomerSummary[];
  drawings: DrawingSummary[];
  users: CompanyUserRecord[];
  auditLog: AuditLogRecord[];
}

export const EMPTY_PORTAL_COMPANY_DATA: PortalCompanyData = {
  customers: [],
  drawings: [],
  users: [],
  auditLog: []
};

export function sessionCanManageCompanyData(session: AuthSessionEnvelope): boolean {
  return session.user.role === "OWNER" || session.user.role === "ADMIN";
}

export async function loadPortalCompanyData(session: AuthSessionEnvelope): Promise<PortalCompanyData> {
  const canManage = sessionCanManageCompanyData(session);
  const [customers, drawings, users, auditLog] = await Promise.all([
    listCustomers(),
    listDrawings(),
    canManage ? listUsers() : Promise.resolve([]),
    canManage ? listAuditLog() : Promise.resolve([])
  ]);

  return {
    customers,
    drawings,
    users,
    auditLog
  };
}

export function updateDrawingSummaryFromRecord(drawing: DrawingRecord, current?: DrawingSummary): DrawingSummary {
  const contributorUserIds = current?.contributorUserIds ?? [...new Set([drawing.createdByUserId, drawing.updatedByUserId])];
  return {
    id: drawing.id,
    companyId: drawing.companyId,
    name: drawing.name,
    customerId: drawing.customerId,
    customerName: drawing.customerName,
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
    createdByDisplayName: current?.createdByDisplayName ?? "",
    updatedByUserId: drawing.updatedByUserId,
    updatedByDisplayName: current?.updatedByDisplayName ?? "",
    contributorUserIds,
    contributorDisplayNames: current?.contributorDisplayNames ?? [],
    createdAtIso: drawing.createdAtIso,
    updatedAtIso: drawing.updatedAtIso
  };
}
