import type {
  AuditAction,
  AuditEntityType,
  AuditLogRecord,
  CompanyRecord,
  CompanyUserRecord,
  CompanyUserRole,
  DrawingRecord,
  DrawingSummary,
  DrawingVersionRecord,
  DrawingVersionSource,
  EstimateResult,
  LayoutModel
} from "@fence-estimator/contracts";

import type { StoredUser } from "./types.js";

export interface CompanyRow {
  id: string;
  name: string;
  created_at_iso: string;
}

export interface UserRow {
  id: string;
  company_id: string;
  email: string;
  display_name: string;
  role: CompanyUserRole;
  password_hash: string;
  password_salt: string;
  created_at_iso: string;
}

export interface DrawingRow {
  id: string;
  company_id: string;
  name: string;
  layout_json: string;
  estimate_json: string;
  version_number: number;
  is_archived: number;
  archived_at_iso: string | null;
  archived_by_user_id: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
}

export interface DrawingVersionRow {
  id: string;
  drawing_id: string;
  company_id: string;
  version_number: number;
  source: DrawingVersionSource;
  name: string;
  layout_json: string;
  estimate_json: string;
  created_by_user_id: string;
  created_at_iso: string;
}

export interface AuditLogRow {
  id: string;
  company_id: string;
  actor_user_id: string | null;
  entity_type: AuditEntityType;
  entity_id: string | null;
  action: AuditAction;
  summary: string;
  metadata_json: string | null;
  created_at_iso: string;
}

export interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at_iso: string;
  expires_at_iso: string;
  consumed_at_iso: string | null;
}

export function toPublicUser(user: StoredUser | UserRow): CompanyUserRecord {
  if ("companyId" in user) {
    return {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAtIso: user.createdAtIso
    };
  }

  return {
    id: user.id,
    companyId: user.company_id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    createdAtIso: user.created_at_iso
  };
}

export function toCompany(row: CompanyRow): CompanyRecord {
  return {
    id: row.id,
    name: row.name,
    createdAtIso: row.created_at_iso
  };
}

export function toDrawing(row: DrawingRow): DrawingRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    layout: JSON.parse(row.layout_json) as LayoutModel,
    estimate: JSON.parse(row.estimate_json) as EstimateResult,
    versionNumber: row.version_number,
    isArchived: row.is_archived === 1,
    archivedAtIso: row.archived_at_iso,
    archivedByUserId: row.archived_by_user_id,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso
  };
}

export function toDrawingSummary(drawing: DrawingRecord): DrawingSummary {
  return {
    id: drawing.id,
    companyId: drawing.companyId,
    name: drawing.name,
    previewLayout: drawing.layout,
    segmentCount: drawing.layout.segments.length,
    gateCount: drawing.layout.gates?.length ?? 0,
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

export function toDrawingVersion(row: DrawingVersionRow): DrawingVersionRecord {
  return {
    id: row.id,
    drawingId: row.drawing_id,
    companyId: row.company_id,
    versionNumber: row.version_number,
    source: row.source,
    name: row.name,
    layout: JSON.parse(row.layout_json) as LayoutModel,
    estimate: JSON.parse(row.estimate_json) as EstimateResult,
    createdByUserId: row.created_by_user_id,
    createdAtIso: row.created_at_iso
  };
}

export function toAuditLog(row: AuditLogRow): AuditLogRecord {
  const metadata = row.metadata_json
    ? (JSON.parse(row.metadata_json) as Record<string, string | number | boolean | null>)
    : undefined;

  return {
    id: row.id,
    companyId: row.company_id,
    actorUserId: row.actor_user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    summary: row.summary,
    createdAtIso: row.created_at_iso,
    ...(metadata ? { metadata } : {})
  };
}
