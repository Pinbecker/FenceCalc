import type {
  AuditAction,
  AuditEntityType,
  AuditLogRecord,
  CompanyRecord,
  CompanyUserRecord,
  CompanyUserRole,
  CustomerRecord,
  CustomerSummary,
  DrawingTaskRecord,
  DrawingWorkspaceCommercialInputs,
  DrawingWorkspaceRecord,
  DrawingWorkspaceSummary,
  DrawingJobRole,
  DrawingRecord,
  DrawingStatus,
  DrawingSummary,
  DrawingVersionRecord,
  DrawingVersionSource,
  EstimateWorkbook,
  EstimateWorkbookManualEntry,
  EstimateResult,
  JobCommercialInputs,
  JobRecord,
  JobSummary,
  JobTaskRecord,
  LayoutModel,
  PricingConfigRecord,
  PricedEstimateResult,
  QuoteRecord,
} from "@fence-estimator/contracts";
import {
  DRAWING_SCHEMA_VERSION,
  DRAWING_STATUSES,
  buildDefaultJobCommercialInputs,
  buildDefaultPricingWorkbookConfig,
  mergePricingWorkbookWithTemplate,
  customerRecordSchema,
  customerSummarySchema,
  drawingCanvasViewportSchema,
  estimateResultSchema,
  drawingTaskRecordSchema,
  drawingWorkspaceRecordSchema,
  drawingWorkspaceSummarySchema,
  jobCommercialInputsSchema,
  jobRecordSchema,
  jobSummarySchema,
  jobTaskRecordSchema,
  layoutModelSchema,
  pricingConfigRecordSchema,
  quoteRecordSchema,
} from "@fence-estimator/contracts";
import { RULES_ENGINE_VERSION } from "@fence-estimator/rules-engine";
import type { ZodType } from "zod";

import type { StoredUser } from "./types.js";

interface StoredLayoutShape {
  segments: LayoutModel["segments"];
  gates?: LayoutModel["gates"] | undefined;
  basketballFeatures?: LayoutModel["basketballFeatures"] | undefined;
  basketballPosts?: LayoutModel["basketballPosts"] | undefined;
  floodlightColumns?: LayoutModel["floodlightColumns"] | undefined;
  goalUnits?: LayoutModel["goalUnits"] | undefined;
  kickboards?:
    | Array<{
        id: string;
        segmentId: string;
        sectionHeightMm: number;
        thicknessMm?: number | undefined;
        profile: string;
        boardLengthMm?: number | undefined;
      }>
    | undefined;
  pitchDividers?: LayoutModel["pitchDividers"] | undefined;
  sideNettings?:
    | Array<{
        id: string;
        segmentId: string;
        additionalHeightMm: number;
        extendedPostInterval: 3;
        startOffsetMm?: number | undefined;
        endOffsetMm?: number | undefined;
      }>
    | undefined;
}

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

export interface CustomerRow {
  id: string;
  company_id: string;
  name: string;
  primary_contact_name: string;
  primary_email: string;
  primary_phone: string;
  additional_contacts_json: string;
  site_address: string;
  notes: string;
  is_archived: number;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
}

export interface CustomerSummaryRow extends CustomerRow {
  active_drawing_count: number;
  archived_drawing_count: number;
  last_activity_at_iso: string | null;
}

export interface DrawingRow {
  id: string;
  company_id: string;
  job_id: string | null;
  job_role: string | null;
  parent_drawing_id: string | null;
  name: string;
  customer_id: string | null;
  customer_name: string;
  resolved_customer_name?: string | null;
  layout_json: string;
  viewport_json?: string | null;
  estimate_json: string;
  schema_version: number;
  rules_version: string;
  version_number: number;
  status: string;
  is_archived: number;
  archived_at_iso: string | null;
  archived_by_user_id: string | null;
  revision_number: number | null;
  status_changed_at_iso: string | null;
  status_changed_by_user_id: string | null;
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
  customer_id: string | null;
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
  entity_type: string;
  entity_id: string | null;
  action: string;
  summary: string;
  metadata_json: string | null;
  created_at_iso: string;
}

export interface JobRow {
  id: string;
  company_id: string;
  customer_id: string;
  customer_name: string;
  resolved_customer_name?: string | null;
  name: string;
  stage: string;
  primary_drawing_id: string | null;
  commercial_inputs_json: string;
  notes: string;
  owner_user_id: string | null;
  owner_display_name?: string | null;
  is_archived: number;
  archived_at_iso: string | null;
  archived_by_user_id: string | null;
  stage_changed_at_iso: string | null;
  stage_changed_by_user_id: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  updated_by_display_name?: string | null;
  created_at_iso: string;
  updated_at_iso: string;
}

export interface JobSummaryRow extends JobRow {
  drawing_count: number;
  open_task_count: number;
  completed_task_count: number;
  last_activity_at_iso: string | null;
  latest_quote_total: number | null;
  latest_quote_created_at_iso: string | null;
  latest_estimate_total: number | null;
  primary_drawing_name: string | null;
  primary_drawing_updated_at_iso: string | null;
  primary_layout_json: string | null;
}

export interface PricingConfigRow {
  company_id: string;
  config_json: string;
  updated_at_iso: string;
  updated_by_user_id: string | null;
}

export interface QuoteRow {
  id: string;
  company_id: string;
  job_id: string;
  source_drawing_id: string;
  source_drawing_version_number: number;
  drawing_id: string;
  drawing_version_number: number;
  quote_json: string;
  created_by_user_id: string;
  created_at_iso: string;
}

export interface JobTaskRow {
  id: string;
  company_id: string;
  job_id: string;
  job_name?: string | null;
  drawing_id: string | null;
  drawing_name?: string | null;
  revision_drawing_id?: string | null;
  revision_drawing_name?: string | null;
  title: string;
  description: string | null;
  priority: string | null;
  is_completed: number;
  assigned_user_id: string | null;
  assigned_user_display_name?: string | null;
  due_at_iso: string | null;
  completed_at_iso: string | null;
  completed_by_user_id: string | null;
  completed_by_display_name?: string | null;
  created_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
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
      createdAtIso: user.createdAtIso,
    };
  }

  return {
    id: user.id,
    companyId: user.company_id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    createdAtIso: user.created_at_iso,
  };
}

export function toCompany(row: CompanyRow): CompanyRecord {
  return {
    id: row.id,
    name: row.name,
    createdAtIso: row.created_at_iso,
  };
}

export function toCustomer(row: CustomerRow): CustomerRecord {
  let additionalContacts: unknown = [];
  try {
    const parsedContacts: unknown = JSON.parse(row.additional_contacts_json || "[]");
    if (Array.isArray(parsedContacts)) {
      additionalContacts = parsedContacts;
    }
  } catch {
    additionalContacts = [];
  }

  const parsed = customerRecordSchema.parse({
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    primaryContactName: row.primary_contact_name,
    primaryEmail: row.primary_email,
    primaryPhone: row.primary_phone,
    additionalContacts,
    siteAddress: row.site_address,
    notes: row.notes,
    isArchived: row.is_archived === 1,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  });
  return parsed;
}

export function toCustomerSummary(row: CustomerSummaryRow): CustomerSummary {
  const parsed = customerSummarySchema.parse({
    ...toCustomer(row),
    activeDrawingCount: row.active_drawing_count,
    archivedDrawingCount: row.archived_drawing_count,
    lastActivityAtIso: row.last_activity_at_iso,
  });
  return parsed;
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

function parseOptionalStoredJson<T>(
  raw: string | null | undefined,
  schema: ZodType<T>,
  label: string,
): T | null {
  if (!raw) {
    return null;
  }
  return parseStoredJson(raw, schema, label);
}

function buildPreviewLayout(layout: LayoutModel): LayoutModel {
  const segments = layout.segments.slice(0, 40);
  const segmentIds = new Set(segments.map((segment) => segment.id));
  const preview = {
    segments,
    gates: (layout.gates ?? []).filter((gate) => segmentIds.has(gate.segmentId)).slice(0, 12),
    basketballFeatures: (layout.basketballFeatures ?? [])
      .filter((feature) => segmentIds.has(feature.segmentId))
      .slice(0, 20),
    basketballPosts: (layout.basketballPosts ?? [])
      .filter((post) => segmentIds.has(post.segmentId))
      .slice(0, 20),
    floodlightColumns: (layout.floodlightColumns ?? [])
      .filter((column) => segmentIds.has(column.segmentId))
      .slice(0, 20),
    goalUnits: (layout.goalUnits ?? [])
      .filter((unit) => segmentIds.has(unit.segmentId))
      .slice(0, 12),
    kickboards: (layout.kickboards ?? [])
      .filter((kickboard) => segmentIds.has(kickboard.segmentId))
      .slice(0, 20),
    pitchDividers: (layout.pitchDividers ?? [])
      .filter(
        (divider) =>
          segmentIds.has(divider.startAnchor.segmentId) &&
          segmentIds.has(divider.endAnchor.segmentId),
      )
      .slice(0, 12),
    sideNettings: (layout.sideNettings ?? [])
      .filter((netting) => segmentIds.has(netting.segmentId))
      .slice(0, 20),
  };

  const result = layoutModelSchema.safeParse(JSON.parse(JSON.stringify(preview)));
  if (result.success) {
    return result.data as LayoutModel;
  }
  return {
    segments,
    gates: [],
    basketballFeatures: [],
    basketballPosts: [],
    floodlightColumns: [],
    goalUnits: [],
    kickboards: [],
    pitchDividers: [],
    sideNettings: [],
  };
}

function buildStoredLayout(layout: StoredLayoutShape): LayoutModel {
  return {
    segments: layout.segments,
    gates: layout.gates ?? [],
    basketballFeatures: layout.basketballFeatures ?? [],
    basketballPosts: layout.basketballPosts ?? [],
    floodlightColumns: layout.floodlightColumns ?? [],
    goalUnits: layout.goalUnits ?? [],
    kickboards: (layout.kickboards ?? []).map((kickboard) => ({
      id: kickboard.id,
      segmentId: kickboard.segmentId,
      sectionHeightMm: kickboard.sectionHeightMm,
      thicknessMm: kickboard.thicknessMm ?? 50,
      profile: kickboard.profile,
      boardLengthMm: kickboard.boardLengthMm ?? 2500,
    })),
    pitchDividers: layout.pitchDividers ?? [],
    sideNettings: (layout.sideNettings ?? []).map((sideNetting) => ({
      id: sideNetting.id,
      segmentId: sideNetting.segmentId,
      additionalHeightMm: sideNetting.additionalHeightMm,
      extendedPostInterval: sideNetting.extendedPostInterval,
      ...(sideNetting.startOffsetMm === undefined
        ? {}
        : { startOffsetMm: sideNetting.startOffsetMm }),
      ...(sideNetting.endOffsetMm === undefined ? {} : { endOffsetMm: sideNetting.endOffsetMm }),
    })),
  };
}

function parseDrawingStatus(raw: string | undefined | null): DrawingStatus {
  const value = raw ?? "DRAFT";
  return (DRAWING_STATUSES as readonly string[]).includes(value)
    ? (value as DrawingStatus)
    : "DRAFT";
}

function parseDrawingJobRole(raw: string | undefined | null): DrawingJobRole | null {
  if (raw === "PRIMARY" || raw === "SECONDARY") {
    return raw;
  }
  return null;
}

function normalizeAuditEntityType(entityType: string): AuditEntityType {
  return entityType === "JOB" ? "WORKSPACE" : (entityType as AuditEntityType);
}

function normalizeAuditAction(action: string): AuditAction {
  switch (action) {
    case "JOB_CREATED":
      return "WORKSPACE_CREATED";
    case "JOB_UPDATED":
      return "WORKSPACE_UPDATED";
    case "JOB_ARCHIVED":
      return "WORKSPACE_ARCHIVED";
    case "JOB_UNARCHIVED":
      return "WORKSPACE_UNARCHIVED";
    case "JOB_STAGE_CHANGED":
      return "WORKSPACE_STAGE_CHANGED";
    case "JOB_PRIMARY_DRAWING_CHANGED":
      return "WORKSPACE_UPDATED";
    case "JOB_DRAWING_ADDED":
      return "WORKSPACE_DRAWING_ADDED";
    case "JOB_TASK_CREATED":
      return "WORKSPACE_TASK_CREATED";
    case "JOB_TASK_UPDATED":
      return "WORKSPACE_TASK_UPDATED";
    case "JOB_TASK_DELETED":
      return "WORKSPACE_TASK_DELETED";
    case "JOB_DELETED":
      return "WORKSPACE_DELETED";
    default:
      return action as AuditAction;
  }
}

function normalizeJobCommercialInputs(inputs: unknown): JobCommercialInputs {
  const parsed = jobCommercialInputsSchema.safeParse(inputs);
  if (parsed.success) {
    return {
      ...buildDefaultJobCommercialInputs(),
      ...parsed.data,
      labourDayValue:
        parsed.data.labourDayValue ?? buildDefaultJobCommercialInputs().labourDayValue,
      hardDigRatePerHole:
        parsed.data.hardDigRatePerHole ?? buildDefaultJobCommercialInputs().hardDigRatePerHole,
      clearSpoilsRatePerHole:
        parsed.data.clearSpoilsRatePerHole ??
        buildDefaultJobCommercialInputs().clearSpoilsRatePerHole,
      externalCornersEnabled: parsed.data.externalCornersEnabled ?? true,
    };
  }
  return buildDefaultJobCommercialInputs();
}

function normalizeDrawingWorkspaceCommercialInputs(
  inputs: unknown,
): DrawingWorkspaceCommercialInputs {
  return normalizeJobCommercialInputs(inputs);
}

type ParsedEstimateResult = Omit<EstimateResult, "corners"> & {
  corners: Omit<EstimateResult["corners"], "byHeightMm"> & {
    byHeightMm?: EstimateResult["corners"]["byHeightMm"] | undefined;
  };
};

type ParsedEstimateWorkbook = Omit<EstimateWorkbook, "manualEntries"> & {
  manualEntries?: EstimateWorkbookManualEntry[] | undefined;
};

type ParsedPricedEstimateResult = Omit<PricedEstimateResult, "manualEntries" | "workbook"> & {
  manualEntries?: EstimateWorkbookManualEntry[] | undefined;
  workbook?: ParsedEstimateWorkbook | undefined;
};

function normalizeEstimateResult(estimate: ParsedEstimateResult): EstimateResult {
  return {
    ...estimate,
    corners: {
      ...estimate.corners,
      byHeightMm: estimate.corners.byHeightMm ?? {},
    },
  };
}

function normalizeEstimateWorkbook(workbook: ParsedEstimateWorkbook): EstimateWorkbook {
  return {
    ...workbook,
    manualEntries: workbook.manualEntries ?? [],
  };
}

function normalizePricedEstimateResult(
  pricedEstimate: ParsedPricedEstimateResult,
): PricedEstimateResult {
  return {
    drawing: pricedEstimate.drawing,
    groups: pricedEstimate.groups,
    ancillaryItems: pricedEstimate.ancillaryItems,
    manualEntries: pricedEstimate.manualEntries ?? [],
    totals: pricedEstimate.totals,
    warnings: pricedEstimate.warnings,
    pricingSnapshot: pricedEstimate.pricingSnapshot,
    ...(pricedEstimate.workbook
      ? { workbook: normalizeEstimateWorkbook(pricedEstimate.workbook) }
      : {}),
  };
}

export function toDrawing(row: DrawingRow): DrawingRecord {
  const parsedLayout = parseStoredJson(
    row.layout_json,
    layoutModelSchema,
    `layout for drawing ${row.id}`,
  );
  const savedViewport = parseOptionalStoredJson(
    row.viewport_json,
    drawingCanvasViewportSchema,
    `viewport for drawing ${row.id}`,
  );
  const layout = buildStoredLayout(parsedLayout);
  const estimate = normalizeEstimateResult(
    parseStoredJson(
      row.estimate_json,
      estimateResultSchema,
      `estimate for drawing ${row.id}`,
    ) as ParsedEstimateResult,
  );

  return {
    id: row.id,
    companyId: row.company_id,
    workspaceId: row.job_id,
    jobRole: parseDrawingJobRole(row.job_role),
    parentDrawingId: row.parent_drawing_id ?? null,
    revisionNumber: row.revision_number ?? 0,
    name: row.name,
    customerId: row.customer_id,
    customerName: row.resolved_customer_name ?? row.customer_name,
    layout,
    ...(savedViewport ? { savedViewport } : {}),
    estimate,
    schemaVersion: row.schema_version ?? DRAWING_SCHEMA_VERSION,
    rulesVersion: row.rules_version ?? RULES_ENGINE_VERSION,
    versionNumber: row.version_number,
    status: parseDrawingStatus(row.status),
    isArchived: row.is_archived === 1,
    archivedAtIso: row.archived_at_iso,
    archivedByUserId: row.archived_by_user_id,
    statusChangedAtIso: row.status_changed_at_iso ?? null,
    statusChangedByUserId: row.status_changed_by_user_id ?? null,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  };
}

interface DrawingSummaryMetadata {
  createdByDisplayName: string;
  updatedByDisplayName: string;
  contributorUserIds: string[];
  contributorDisplayNames: string[];
}

export function toDrawingSummary(
  drawing: DrawingRecord,
  metadata?: Partial<DrawingSummaryMetadata>,
): DrawingSummary {
  return {
    id: drawing.id,
    companyId: drawing.companyId,
    ...(drawing.workspaceId !== undefined ? { workspaceId: drawing.workspaceId } : {}),
    ...(drawing.jobRole !== undefined ? { jobRole: drawing.jobRole } : {}),
    ...(drawing.parentDrawingId !== undefined ? { parentDrawingId: drawing.parentDrawingId } : {}),
    revisionNumber: drawing.revisionNumber,
    name: drawing.name,
    customerId: drawing.customerId,
    customerName: drawing.customerName,
    previewLayout: buildPreviewLayout(drawing.layout),
    segmentCount: drawing.layout.segments.length,
    gateCount: drawing.layout.gates?.length ?? 0,
    schemaVersion: drawing.schemaVersion,
    rulesVersion: drawing.rulesVersion,
    versionNumber: drawing.versionNumber,
    status: drawing.status,
    isArchived: drawing.isArchived,
    archivedAtIso: drawing.archivedAtIso,
    archivedByUserId: drawing.archivedByUserId,
    statusChangedAtIso: drawing.statusChangedAtIso,
    statusChangedByUserId: drawing.statusChangedByUserId,
    createdByUserId: drawing.createdByUserId,
    createdByDisplayName: metadata?.createdByDisplayName ?? "",
    updatedByUserId: drawing.updatedByUserId,
    updatedByDisplayName: metadata?.updatedByDisplayName ?? "",
    contributorUserIds: metadata?.contributorUserIds ?? [],
    contributorDisplayNames: metadata?.contributorDisplayNames ?? [],
    createdAtIso: drawing.createdAtIso,
    updatedAtIso: drawing.updatedAtIso,
  };
}

export function toDrawingVersion(row: DrawingVersionRow): DrawingVersionRecord {
  const parsedLayout = parseStoredJson(
    row.layout_json,
    layoutModelSchema,
    `layout for drawing version ${row.id}`,
  );
  const savedViewport = parseOptionalStoredJson(
    row.viewport_json,
    drawingCanvasViewportSchema,
    `viewport for drawing version ${row.id}`,
  );
  const layout = buildStoredLayout(parsedLayout);
  const estimate = normalizeEstimateResult(
    parseStoredJson(
      row.estimate_json,
      estimateResultSchema,
      `estimate for drawing version ${row.id}`,
    ) as ParsedEstimateResult,
  );

  return {
    id: row.id,
    drawingId: row.drawing_id,
    companyId: row.company_id,
    schemaVersion: row.schema_version ?? DRAWING_SCHEMA_VERSION,
    rulesVersion: row.rules_version ?? RULES_ENGINE_VERSION,
    versionNumber: row.version_number,
    source: row.source,
    name: row.name,
    customerId: row.customer_id,
    customerName: row.customer_name,
    layout,
    ...(savedViewport ? { savedViewport } : {}),
    estimate,
    createdByUserId: row.created_by_user_id,
    createdAtIso: row.created_at_iso,
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
    entityType: normalizeAuditEntityType(row.entity_type),
    entityId: row.entity_id,
    action: normalizeAuditAction(row.action),
    summary: row.summary,
    createdAtIso: row.created_at_iso,
    ...(metadata ? { metadata } : {}),
  };
}

export function toJob(row: JobRow): JobRecord {
  let commercialInputs: unknown = buildDefaultJobCommercialInputs();
  try {
    commercialInputs = JSON.parse(row.commercial_inputs_json);
  } catch {
    commercialInputs = buildDefaultJobCommercialInputs();
  }

  return jobRecordSchema.parse({
    id: row.id,
    companyId: row.company_id,
    customerId: row.customer_id,
    customerName: row.resolved_customer_name ?? row.customer_name,
    name: row.name,
    stage: row.stage,
    primaryDrawingId: row.primary_drawing_id,
    commercialInputs: normalizeJobCommercialInputs(commercialInputs),
    notes: row.notes,
    ownerUserId: row.owner_user_id,
    ownerDisplayName: row.owner_display_name ?? "",
    isArchived: row.is_archived === 1,
    archivedAtIso: row.archived_at_iso,
    archivedByUserId: row.archived_by_user_id,
    stageChangedAtIso: row.stage_changed_at_iso,
    stageChangedByUserId: row.stage_changed_by_user_id,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    updatedByDisplayName: row.updated_by_display_name ?? "",
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  });
}

export function toDrawingWorkspace(row: JobRow): DrawingWorkspaceRecord {
  const job = toJob(row);
  return drawingWorkspaceRecordSchema.parse({
    ...job,
    commercialInputs: normalizeDrawingWorkspaceCommercialInputs(job.commercialInputs),
  });
}

export function toJobSummary(row: JobSummaryRow): JobSummary {
  const base = toJob(row);
  let primaryPreviewLayout: LayoutModel | null = null;
  if (row.primary_layout_json) {
    try {
      primaryPreviewLayout = buildPreviewLayout(
        buildStoredLayout(
          parseStoredJson(
            row.primary_layout_json,
            layoutModelSchema,
            `primary layout for job ${row.id}`,
          ),
        ),
      );
    } catch {
      // Corrupt layout data for this job — degrade gracefully instead of
      // crashing the entire job list (the fallback query loses ALL layouts).
    }
  }

  return jobSummarySchema.parse({
    ...base,
    drawingCount: row.drawing_count,
    openTaskCount: row.open_task_count,
    completedTaskCount: row.completed_task_count,
    lastActivityAtIso: row.last_activity_at_iso,
    latestQuoteTotal: row.latest_quote_total,
    latestQuoteCreatedAtIso: row.latest_quote_created_at_iso,
    latestEstimateTotal: row.latest_estimate_total,
    primaryDrawingName: row.primary_drawing_name,
    primaryDrawingUpdatedAtIso: row.primary_drawing_updated_at_iso,
    primaryPreviewLayout,
  }) as JobSummary;
}

export function toDrawingWorkspaceSummary(row: JobSummaryRow): DrawingWorkspaceSummary {
  return drawingWorkspaceSummarySchema.parse(toJobSummary(row)) as DrawingWorkspaceSummary;
}

export function toJobTask(row: JobTaskRow): JobTaskRecord {
  return jobTaskRecordSchema.parse({
    id: row.id,
    companyId: row.company_id,
    jobId: row.job_id,
    jobName: row.job_name ?? "",
    drawingId: row.drawing_id,
    drawingName: row.drawing_name ?? "",
    revisionDrawingId: row.revision_drawing_id ?? null,
    revisionDrawingName: row.revision_drawing_name ?? "",
    title: row.title,
    description: row.description ?? "",
    priority: row.priority ?? "NORMAL",
    isCompleted: row.is_completed === 1,
    assignedUserId: row.assigned_user_id,
    assignedUserDisplayName: row.assigned_user_display_name ?? "",
    dueAtIso: row.due_at_iso,
    completedAtIso: row.completed_at_iso,
    completedByUserId: row.completed_by_user_id,
    completedByDisplayName: row.completed_by_display_name ?? "",
    createdByUserId: row.created_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  }) as unknown as JobTaskRecord;
}

export function toDrawingTask(row: JobTaskRow): DrawingTaskRecord {
  return drawingTaskRecordSchema.parse({
    id: row.id,
    companyId: row.company_id,
    workspaceId: row.job_id,
    workspaceName: row.job_name ?? "",
    rootDrawingId: row.drawing_id,
    rootDrawingName: row.drawing_name ?? "",
    revisionDrawingId: row.revision_drawing_id ?? null,
    revisionDrawingName: row.revision_drawing_name ?? "",
    title: row.title,
    description: row.description ?? "",
    priority: row.priority ?? "NORMAL",
    isCompleted: row.is_completed === 1,
    assignedUserId: row.assigned_user_id,
    assignedUserDisplayName: row.assigned_user_display_name ?? "",
    dueAtIso: row.due_at_iso,
    completedAtIso: row.completed_at_iso,
    completedByUserId: row.completed_by_user_id,
    completedByDisplayName: row.completed_by_display_name ?? "",
    createdByUserId: row.created_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  }) as unknown as DrawingTaskRecord;
}

export function normalizePricingConfigRecord(
  pricingConfig: PricingConfigRecord,
): PricingConfigRecord {
  return {
    ...pricingConfig,
    workbook: mergePricingWorkbookWithTemplate(
      pricingConfig.workbook ?? buildDefaultPricingWorkbookConfig(),
    ),
  };
}

export function toPricingConfig(row: PricingConfigRow): PricingConfigRecord {
  const parsed = parseStoredJson(
    row.config_json,
    pricingConfigRecordSchema,
    `pricing config for company ${row.company_id}`,
  );
  return normalizePricingConfigRecord({
    ...parsed,
    companyId: row.company_id,
    updatedAtIso: row.updated_at_iso,
    updatedByUserId: row.updated_by_user_id,
  });
}

export function toQuoteRecord(row: QuoteRow): QuoteRecord {
  const parsed = parseStoredJson(row.quote_json, quoteRecordSchema, `quote ${row.id}`);
  const drawingSnapshot = {
    layout: buildStoredLayout(parsed.drawingSnapshot.layout),
    drawingId: parsed.drawingSnapshot.drawingId,
    drawingName: parsed.drawingSnapshot.drawingName,
    customerId: parsed.drawingSnapshot.customerId,
    customerName: parsed.drawingSnapshot.customerName,
    estimate: normalizeEstimateResult(parsed.drawingSnapshot.estimate as ParsedEstimateResult),
    schemaVersion: parsed.drawingSnapshot.schemaVersion,
    rulesVersion: parsed.drawingSnapshot.rulesVersion,
    versionNumber: parsed.drawingSnapshot.versionNumber,
    ...(parsed.drawingSnapshot.savedViewport !== undefined
      ? { savedViewport: parsed.drawingSnapshot.savedViewport }
      : {}),
  };
  return {
    id: row.id,
    companyId: row.company_id,
    workspaceId: row.job_id,
    sourceDrawingId: row.source_drawing_id,
    sourceDrawingVersionNumber: row.source_drawing_version_number,
    drawingId: row.drawing_id,
    drawingVersionNumber: row.drawing_version_number,
    pricedEstimate: normalizePricedEstimateResult(
      parsed.pricedEstimate as ParsedPricedEstimateResult,
    ),
    drawingSnapshot,
    createdByUserId: row.created_by_user_id,
    createdAtIso: row.created_at_iso,
  };
}
