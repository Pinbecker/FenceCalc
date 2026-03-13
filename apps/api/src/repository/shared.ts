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
  LayoutModel
} from "@fence-estimator/contracts";
import {
  DRAWING_SCHEMA_VERSION,
  drawingCanvasViewportSchema,
  estimateResultSchema,
  layoutModelSchema
} from "@fence-estimator/contracts";
import { RULES_ENGINE_VERSION } from "@fence-estimator/rules-engine";
import type { ZodType } from "zod";

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
  customer_name: string;
  layout_json: string;
  viewport_json?: string | null;
  estimate_json: string;
  schema_version: number;
  rules_version: string;
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
  schema_version: number;
  rules_version: string;
  version_number: number;
  source: DrawingVersionSource;
  name: string;
  customer_name: string;
  layout_json: string;
  viewport_json?: string | null;
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

function parseStoredJson<T>(raw: string, schema: ZodType<T>, label: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Corrupt stored ${label}: invalid JSON`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Corrupt stored ${label}: schema validation failed`);
  }
  return result.data;
}

function parseOptionalStoredJson<T>(raw: string | null | undefined, schema: ZodType<T>, label: string): T | null {
  if (!raw) {
    return null;
  }
  return parseStoredJson(raw, schema, label);
}

function buildPreviewLayout(layout: LayoutModel): LayoutModel {
  return {
    segments: layout.segments.slice(0, 40),
    gates: (layout.gates ?? []).slice(0, 12),
    basketballPosts: (layout.basketballPosts ?? []).slice(0, 20)
  };
}

export function toDrawing(row: DrawingRow): DrawingRecord {
  const parsedLayout = parseStoredJson(row.layout_json, layoutModelSchema, `layout for drawing ${row.id}`);
  const savedViewport = parseOptionalStoredJson(
    row.viewport_json,
    drawingCanvasViewportSchema,
    `viewport for drawing ${row.id}`
  );
  const layout: LayoutModel = {
    segments: parsedLayout.segments,
    gates: parsedLayout.gates ?? [],
    basketballPosts: parsedLayout.basketballPosts ?? []
  };
  const estimate = parseStoredJson(row.estimate_json, estimateResultSchema, `estimate for drawing ${row.id}`);

  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    customerName: row.customer_name,
    layout,
    ...(savedViewport ? { savedViewport } : {}),
    estimate,
    schemaVersion: row.schema_version ?? DRAWING_SCHEMA_VERSION,
    rulesVersion: row.rules_version ?? RULES_ENGINE_VERSION,
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

interface DrawingSummaryMetadata {
  createdByDisplayName: string;
  updatedByDisplayName: string;
  contributorUserIds: string[];
  contributorDisplayNames: string[];
}

export function toDrawingSummary(drawing: DrawingRecord, metadata?: Partial<DrawingSummaryMetadata>): DrawingSummary {
  return {
    id: drawing.id,
    companyId: drawing.companyId,
    name: drawing.name,
    customerName: drawing.customerName,
    previewLayout: buildPreviewLayout(drawing.layout),
    segmentCount: drawing.layout.segments.length,
    gateCount: drawing.layout.gates?.length ?? 0,
    schemaVersion: drawing.schemaVersion,
    rulesVersion: drawing.rulesVersion,
    versionNumber: drawing.versionNumber,
    isArchived: drawing.isArchived,
    archivedAtIso: drawing.archivedAtIso,
    archivedByUserId: drawing.archivedByUserId,
    createdByUserId: drawing.createdByUserId,
    createdByDisplayName: metadata?.createdByDisplayName ?? "",
    updatedByUserId: drawing.updatedByUserId,
    updatedByDisplayName: metadata?.updatedByDisplayName ?? "",
    contributorUserIds: metadata?.contributorUserIds ?? [],
    contributorDisplayNames: metadata?.contributorDisplayNames ?? [],
    createdAtIso: drawing.createdAtIso,
    updatedAtIso: drawing.updatedAtIso
  };
}

export function toDrawingVersion(row: DrawingVersionRow): DrawingVersionRecord {
  const parsedLayout = parseStoredJson(row.layout_json, layoutModelSchema, `layout for drawing version ${row.id}`);
  const savedViewport = parseOptionalStoredJson(
    row.viewport_json,
    drawingCanvasViewportSchema,
    `viewport for drawing version ${row.id}`
  );
  const layout: LayoutModel = {
    segments: parsedLayout.segments,
    gates: parsedLayout.gates ?? [],
    basketballPosts: parsedLayout.basketballPosts ?? []
  };
  const estimate = parseStoredJson(row.estimate_json, estimateResultSchema, `estimate for drawing version ${row.id}`);

  return {
    id: row.id,
    drawingId: row.drawing_id,
    companyId: row.company_id,
    schemaVersion: row.schema_version ?? DRAWING_SCHEMA_VERSION,
    rulesVersion: row.rules_version ?? RULES_ENGINE_VERSION,
    versionNumber: row.version_number,
    source: row.source,
    name: row.name,
    customerName: row.customer_name,
    layout,
    ...(savedViewport ? { savedViewport } : {}),
    estimate,
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
