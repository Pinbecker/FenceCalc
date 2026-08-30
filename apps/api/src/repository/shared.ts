import type {
  AuditAction,
  AuditEntityType,
  AuditLogRecord,
  CompanyRecord,
  CompanyUserRecord,
  CustomerRecord,
  CustomerSummary,
  DesignStatus,
  DrawingCanvasViewport,
  DrawingRecord,
  DrawingRevisionRecord,
  DrawingRevisionSummary,
  DrawingSummary,
  EstimateDesignRevisionSelection,
  EstimateRecord,
  EstimateSummary,
  EstimateVersionRecord,
  EstimateVersionStatus,
  EstimateResult,
  LayoutModel,
  PricingConfigRecord,
  ProjectRecord,
  ProjectStatus,
  ProjectSummary,
  QuoteRecord,
  QuoteSummary,
  QuoteVersionRecord,
  QuoteVersionStatus,
  SiteRecord,
  SiteSummary,
  UserRole,
} from "@fence-estimator/contracts";
import {
  drawingCanvasViewportSchema,
  commercialEstimateCalculationSchema,
  estimateCommercialDraftSchema,
  estimateResultSchema,
  layoutModelSchema,
  mergePricingWorkbookWithTemplate,
  pricingConfigRecordSchema,
  quotePresentationSnapshotSchema,
} from "@fence-estimator/contracts";

// -----------------------------------------------------------------------------
// Row shapes
// -----------------------------------------------------------------------------

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
  role: UserRole;
  password_hash: string;
  password_salt: string;
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

export interface CustomerRow {
  id: string;
  company_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  site_address: string | null;
  notes: string | null;
  is_archived: number;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
}

export interface CustomerSummaryRow extends CustomerRow {
  site_count: number;
  project_count: number;
  active_project_count: number;
  last_activity_at_iso: string | null;
}

export interface SiteRow {
  id: string;
  company_id: string;
  customer_id: string;
  name: string;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country_code: string;
  notes: string | null;
  is_archived: number;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
}

export interface SiteSummaryRow extends SiteRow {
  project_count: number;
  active_project_count: number;
  last_activity_at_iso: string | null;
}

export interface ProjectRow {
  id: string;
  company_id: string;
  customer_id: string;
  site_id: string | null;
  reference: string;
  name: string;
  status: ProjectStatus;
  scope: string | null;
  target_date_iso: string | null;
  notes: string | null;
  is_archived: number;
  status_changed_at_iso: string | null;
  status_changed_by_user_id: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
}

export interface ProjectSummaryRow extends ProjectRow {
  customer_name: string;
  site_name: string | null;
  design_count: number;
  estimate_count: number;
  quote_count: number;
  drawing_count: number;
  last_activity_at_iso: string | null;
}

export interface DrawingRow {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  status: DesignStatus;
  current_revision_id: string | null;
  latest_revision_number: number;
  is_archived: number;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
}

export interface EstimateRow {
  id: string;
  company_id: string;
  project_id: string;
  reference: string;
  name: string;
  current_version_id: string | null;
  latest_version_number: number;
  is_archived: number;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
}

export interface EstimateSummaryRow extends EstimateRow {
  current_status: EstimateVersionStatus;
  selected_design_count: number;
}

export interface EstimateVersionRow {
  id: string;
  estimate_id: string;
  company_id: string;
  version_number: number;
  parent_version_id: string | null;
  status: EstimateVersionStatus;
  notes: string | null;
  commercial_draft_json: string;
  calculation_json: string | null;
  calculated_at_iso: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
}

export interface EstimateSelectionRow {
  drawing_id: string;
  drawing_name: string;
  drawing_revision_id: string;
  revision_number: number;
  position: number;
}

export interface QuoteRow {
  id: string;
  company_id: string;
  project_id: string;
  estimate_id: string;
  reference: string;
  name: string;
  current_version_id: string | null;
  latest_version_number: number;
  is_archived: number;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
}

export interface QuoteSummaryRow extends QuoteRow {
  current_status: QuoteVersionStatus;
  estimate_reference: string;
  estimate_version_number: number;
  valid_until_iso: string | null;
}

export interface QuoteVersionRow {
  id: string;
  quote_id: string;
  company_id: string;
  version_number: number;
  parent_version_id: string | null;
  estimate_version_id: string;
  status: QuoteVersionStatus;
  title: string;
  customer_message: string | null;
  valid_until_iso: string | null;
  issued_at_iso: string | null;
  decided_at_iso: string | null;
  presentation_json: string;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
}

export interface DrawingSummaryRow extends DrawingRow {
  layout_json: string;
  created_by_display_name?: string | null;
  updated_by_display_name?: string | null;
}

export interface DrawingRevisionRow {
  id: string;
  drawing_id: string;
  company_id: string;
  revision_number: number;
  parent_revision_id: string | null;
  notes: string | null;
  layout_json: string;
  saved_viewport_json: string | null;
  estimate_json: string;
  schema_version: number;
  rules_version: string;
  version_number: number;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
}

export interface DrawingRevisionSummaryRow extends DrawingRevisionRow {
  segment_count?: number;
  gate_count?: number;
  created_by_display_name?: string | null;
  updated_by_display_name?: string | null;
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

export interface PricingConfigRow {
  company_id: string;
  items_json: string;
  workbook_json: string | null;
  updated_at_iso: string;
  updated_by_user_id: string;
}

// -----------------------------------------------------------------------------
// Mappers
// -----------------------------------------------------------------------------

export function toCompany(row: CompanyRow): CompanyRecord {
  return {
    id: row.id,
    name: row.name,
    createdAtIso: row.created_at_iso,
  };
}

export function toPublicUser(row: UserRow): CompanyUserRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAtIso: row.created_at_iso,
  };
}

export function toCustomer(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    siteAddress: row.site_address,
    notes: row.notes,
    isArchived: row.is_archived === 1,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  };
}

export function toCustomerSummary(row: CustomerSummaryRow): CustomerSummary {
  return {
    ...toCustomer(row),
    siteCount: row.site_count,
    projectCount: row.project_count,
    activeProjectCount: row.active_project_count,
    lastActivityAtIso: row.last_activity_at_iso ?? null,
  };
}

export function toSite(row: SiteRow): SiteRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    customerId: row.customer_id,
    name: row.name,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    city: row.city,
    county: row.county,
    postcode: row.postcode,
    countryCode: row.country_code,
    notes: row.notes,
    isArchived: row.is_archived === 1,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  };
}

export function toSiteSummary(row: SiteSummaryRow): SiteSummary {
  return {
    ...toSite(row),
    projectCount: row.project_count,
    activeProjectCount: row.active_project_count,
    lastActivityAtIso: row.last_activity_at_iso,
  };
}

export function toProject(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    customerId: row.customer_id,
    siteId: row.site_id,
    reference: row.reference,
    name: row.name,
    status: row.status,
    scope: row.scope,
    targetDateIso: row.target_date_iso,
    notes: row.notes,
    isArchived: row.is_archived === 1,
    statusChangedAtIso: row.status_changed_at_iso,
    statusChangedByUserId: row.status_changed_by_user_id,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  };
}

export function toProjectSummary(row: ProjectSummaryRow): ProjectSummary {
  return {
    ...toProject(row),
    customerName: row.customer_name,
    siteName: row.site_name,
    designCount: row.design_count,
    estimateCount: row.estimate_count,
    quoteCount: row.quote_count,
    drawingCount: row.drawing_count,
    lastActivityAtIso: row.last_activity_at_iso ?? null,
  };
}

export function toDrawing(row: DrawingRow): DrawingRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    name: row.name,
    status: row.status,
    currentRevisionId: row.current_revision_id ?? "",
    latestRevisionNumber: row.latest_revision_number,
    isArchived: row.is_archived === 1,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  };
}

export function toDrawingSummary(row: DrawingSummaryRow): DrawingSummary {
  const layout = parseLayout(row.layout_json);
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    name: row.name,
    status: row.status,
    currentRevisionId: row.current_revision_id ?? "",
    latestRevisionNumber: row.latest_revision_number,
    segmentCount: layout.segments.length,
    gateCount: layout.gates?.length ?? 0,
    previewLayout: layout,
    isArchived: row.is_archived === 1,
    createdByUserId: row.created_by_user_id,
    createdByDisplayName: row.created_by_display_name ?? "",
    updatedByUserId: row.updated_by_user_id,
    updatedByDisplayName: row.updated_by_display_name ?? "",
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  };
}

export function toEstimate(row: EstimateRow): EstimateRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    reference: row.reference,
    name: row.name,
    currentVersionId: row.current_version_id ?? "",
    latestVersionNumber: row.latest_version_number,
    isArchived: row.is_archived === 1,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  };
}

export function toEstimateSummary(row: EstimateSummaryRow): EstimateSummary {
  return {
    ...toEstimate(row),
    currentStatus: row.current_status,
    selectedDesignCount: row.selected_design_count,
  };
}

export function toEstimateSelection(row: EstimateSelectionRow): EstimateDesignRevisionSelection {
  return {
    drawingId: row.drawing_id,
    drawingName: row.drawing_name,
    drawingRevisionId: row.drawing_revision_id,
    revisionNumber: row.revision_number,
    position: row.position,
  };
}

export function toEstimateVersion(
  row: EstimateVersionRow,
  designRevisionSelections: EstimateDesignRevisionSelection[],
): EstimateVersionRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    estimateId: row.estimate_id,
    versionNumber: row.version_number,
    parentVersionId: row.parent_version_id,
    status: row.status,
    notes: row.notes,
    designRevisionSelections,
    commercialDraft: estimateCommercialDraftSchema.parse(JSON.parse(row.commercial_draft_json)),
    calculation: row.calculation_json
      ? commercialEstimateCalculationSchema.parse(JSON.parse(row.calculation_json))
      : null,
    calculatedAtIso: row.calculated_at_iso,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  };
}

export function toQuote(row: QuoteRow): QuoteRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    estimateId: row.estimate_id,
    reference: row.reference,
    name: row.name,
    currentVersionId: row.current_version_id ?? "",
    latestVersionNumber: row.latest_version_number,
    isArchived: row.is_archived === 1,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  };
}

export function toQuoteSummary(row: QuoteSummaryRow): QuoteSummary {
  return {
    ...toQuote(row),
    currentStatus: row.current_status,
    estimateReference: row.estimate_reference,
    estimateVersionNumber: row.estimate_version_number,
    validUntilIso: row.valid_until_iso,
  };
}

export function toQuoteVersion(row: QuoteVersionRow): QuoteVersionRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    quoteId: row.quote_id,
    versionNumber: row.version_number,
    parentVersionId: row.parent_version_id,
    estimateVersionId: row.estimate_version_id,
    status: row.status,
    title: row.title,
    customerMessage: row.customer_message,
    validUntilIso: row.valid_until_iso,
    issuedAtIso: row.issued_at_iso,
    decidedAtIso: row.decided_at_iso,
    presentation: quotePresentationSnapshotSchema.parse(JSON.parse(row.presentation_json)),
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  };
}

export function toDrawingRevision(row: DrawingRevisionRow): DrawingRevisionRecord {
  return {
    id: row.id,
    drawingId: row.drawing_id,
    companyId: row.company_id,
    revisionNumber: row.revision_number,
    parentRevisionId: row.parent_revision_id,
    notes: row.notes,
    layout: parseLayout(row.layout_json),
    savedViewport: parseViewport(row.saved_viewport_json),
    estimate: parseEstimate(row.estimate_json),
    schemaVersion: row.schema_version,
    rulesVersion: row.rules_version,
    versionNumber: row.version_number,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  };
}

export function toDrawingRevisionSummary(
  row: DrawingRevisionSummaryRow,
): DrawingRevisionSummary {
  const layout = parseLayout(row.layout_json);
  return {
    id: row.id,
    drawingId: row.drawing_id,
    revisionNumber: row.revision_number,
    parentRevisionId: row.parent_revision_id,
    notes: row.notes,
    segmentCount: layout.segments.length,
    gateCount: layout.gates?.length ?? 0,
    versionNumber: row.version_number,
    createdByUserId: row.created_by_user_id,
    createdByDisplayName: row.created_by_display_name ?? "",
    updatedByUserId: row.updated_by_user_id,
    updatedByDisplayName: row.updated_by_display_name ?? "",
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
  };
}

export function toAuditLog(row: AuditLogRow): AuditLogRecord {
  const record: AuditLogRecord = {
    id: row.id,
    companyId: row.company_id,
    actorUserId: row.actor_user_id,
    entityType: row.entity_type as AuditEntityType,
    entityId: row.entity_id,
    action: row.action as AuditAction,
    summary: row.summary,
    createdAtIso: row.created_at_iso,
  };
  if (row.metadata_json) {
    try {
      const parsed = JSON.parse(row.metadata_json) as Record<string, string | number | boolean | null> | undefined;
      if (parsed) {
        record.metadata = parsed;
      }
    } catch {
      /* ignore corrupted metadata */
    }
  }
  return record;
}

export function toPricingConfig(row: PricingConfigRow): PricingConfigRecord {
  const items = JSON.parse(row.items_json) as PricingConfigRecord["items"];
  const workbook = row.workbook_json
    ? mergePricingWorkbookWithTemplate(
        JSON.parse(row.workbook_json) as PricingConfigRecord["workbook"],
      )
    : undefined;
  return pricingConfigRecordSchema.parse({
    companyId: row.company_id,
    items,
    ...(workbook ? { workbook } : {}),
    updatedAtIso: row.updated_at_iso,
    updatedByUserId: row.updated_by_user_id,
  });
}

// -----------------------------------------------------------------------------
// JSON parsing helpers
// -----------------------------------------------------------------------------

export function parseLayout(json: string): LayoutModel {
  const raw = JSON.parse(json) as unknown;
  return layoutModelSchema.parse(raw) as unknown as LayoutModel;
}

export function parseViewport(json: string | null): DrawingCanvasViewport | null {
  if (!json) {
    return null;
  }
  try {
    const raw = JSON.parse(json) as unknown;
    return drawingCanvasViewportSchema.parse(raw);
  } catch {
    return null;
  }
}

export function parseEstimate(json: string): EstimateResult {
  const raw = JSON.parse(json) as unknown;
  return estimateResultSchema.parse(raw);
}

export function serializeLayout(layout: LayoutModel): string {
  return JSON.stringify(layout);
}

export function serializeViewport(viewport: DrawingCanvasViewport | null | undefined): string | null {
  return viewport ? JSON.stringify(viewport) : null;
}

export function serializeEstimate(estimate: EstimateResult): string {
  return JSON.stringify(estimate);
}
