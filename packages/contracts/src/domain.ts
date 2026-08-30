export interface PointMm {
  x: number;
  y: number;
}

export type FenceSystem = "TWIN_BAR" | "ROLL_FORM";
export const TWIN_BAR_HEIGHT_KEYS = [
  "1.2m",
  "1.8m",
  "2m",
  "2.4m",
  "3m",
  "4m",
  "4.5m",
  "5m",
  "6m",
] as const;
export const ROLL_FORM_HEIGHT_KEYS = ["2m", "3m"] as const;
export const FENCE_HEIGHT_KEYS = [
  "1.2m",
  "1.8m",
  "2m",
  "2.4m",
  "3m",
  "4m",
  "4.5m",
  "5m",
  "6m",
] as const;

export type TwinBarHeightKey = (typeof TWIN_BAR_HEIGHT_KEYS)[number];
export type RollFormHeightKey = (typeof ROLL_FORM_HEIGHT_KEYS)[number];
export type FenceHeightKey = (typeof FENCE_HEIGHT_KEYS)[number];
export type TwinBarVariant = "STANDARD" | "SUPER_REBOUND";

export interface FenceSpec {
  system: FenceSystem;
  height: FenceHeightKey;
  twinBarVariant?: TwinBarVariant | undefined;
}

export interface LayoutSegment {
  id: string;
  start: PointMm;
  end: PointMm;
  spec: FenceSpec;
}

export type GateType = "SINGLE_LEAF" | "DOUBLE_LEAF" | "CUSTOM";

export interface GatePlacement {
  id: string;
  segmentId: string;
  startOffsetMm: number;
  endOffsetMm: number;
  gateType: GateType;
}

export type InlineFeatureFacing = "LEFT" | "RIGHT";

export const GOAL_UNIT_WIDTHS_MM = [3000, 3600, 4800] as const;
export const GOAL_UNIT_HEIGHTS_MM = [3000, 4000] as const;
export const BASKETBALL_ARM_LENGTHS_MM = [1200, 1800] as const;
export const KICKBOARD_SECTION_HEIGHTS_MM = [200, 225, 250] as const;
export const SIDE_NETTING_MAX_ADDITIONAL_HEIGHT_MM = 2000;
export const SIDE_NETTING_EXTENDED_POST_INTERVAL = 3;
export const PITCH_DIVIDER_MAX_SPAN_MM = 70000;
export const PITCH_DIVIDER_SUPPORT_INTERVAL_MM = 15000;

export type GoalUnitWidthMm = number;
export type GoalUnitHeightMm = number;
export type BasketballArmLengthMm = number;
export type KickboardSectionHeightMm = number;
export type KickboardProfile = string;
export type BasketballFeatureType =
  | "DEDICATED_POST"
  | "MOUNTED_TO_EXISTING_POST"
  | "GOAL_UNIT_INTEGRATED";
export type BasketballMountingMode = "PROJECTING_ARM" | "POST_MOUNTED" | "GOAL_UNIT_REAR_CENTER";

export interface SegmentAnchor {
  segmentId: string;
  offsetMm: number;
}

export interface GoalUnitPlacement {
  id: string;
  segmentId: string;
  centerOffsetMm: number;
  side: InlineFeatureFacing;
  widthMm: GoalUnitWidthMm;
  depthMm: number;
  goalHeightMm: GoalUnitHeightMm;
  hasBasketballPost?: boolean | undefined;
}

export interface BasketballFeaturePlacement {
  id: string;
  segmentId: string;
  offsetMm: number;
  facing: InlineFeatureFacing;
  type?: BasketballFeatureType | undefined;
  mountingMode?: BasketballMountingMode | undefined;
  armLengthMm?: BasketballArmLengthMm | undefined;
  pairedFeatureId?: string | null | undefined;
  replacesIntermediatePost?: boolean | undefined;
  goalUnitId?: string | null | undefined;
}

export type BasketballPostPlacement = BasketballFeaturePlacement;

export interface FloodlightColumnPlacement {
  id: string;
  segmentId: string;
  offsetMm: number;
  facing: InlineFeatureFacing;
  heightMm?: number | undefined;
}

export interface KickboardAttachment {
  id: string;
  segmentId: string;
  sectionHeightMm: KickboardSectionHeightMm;
  thicknessMm: number;
  profile: KickboardProfile;
  boardLengthMm: number;
}

export interface PitchDividerPlacement {
  id: string;
  startAnchor: SegmentAnchor;
  endAnchor: SegmentAnchor;
}

export interface SideNettingAttachment {
  id: string;
  segmentId: string;
  additionalHeightMm: number;
  startOffsetMm?: number;
  endOffsetMm?: number;
  extendedPostInterval: 3;
}

export interface LayoutModel {
  segments: LayoutSegment[];
  gates?: GatePlacement[];
  basketballFeatures?: BasketballFeaturePlacement[];
  basketballPosts?: BasketballFeaturePlacement[] | undefined;
  floodlightColumns?: FloodlightColumnPlacement[];
  goalUnits?: GoalUnitPlacement[];
  kickboards?: KickboardAttachment[];
  pitchDividers?: PitchDividerPlacement[];
  sideNettings?: SideNettingAttachment[];
}

export interface DrawingCanvasViewport {
  x: number;
  y: number;
  scale: number;
}

export interface SegmentEstimate {
  segmentId: string;
  lengthMm: number;
  bays: number;
  intermediatePosts: number;
  panels: number;
  roll2100: number;
  roll900: number;
}

export interface CornerSummary {
  total: number;
  internal: number;
  external: number;
  unclassified: number;
  byHeightMm?: Record<
    string,
    {
      total: number;
      internal: number;
      external: number;
      unclassified: number;
    }
  >;
}

export interface MaterialSummary {
  twinBarPanels: number;
  twinBarPanelsSuperRebound: number;
  twinBarPanelsByStockHeightMm: Record<string, number>;
  twinBarPanelsByFenceHeight: Record<
    string,
    { standard: number; superRebound: number; total: number }
  >;
  roll2100: number;
  roll900: number;
  totalRolls: number;
  rollsByFenceHeight: Record<string, { roll2100: number; roll900: number; total: number }>;
}

export type FeatureQuantityKind =
  | "GOAL_UNIT"
  | "BASKETBALL"
  | "KICKBOARD"
  | "PITCH_DIVIDER"
  | "SIDE_NETTING";
export type FeatureQuantityUnit = "item" | "panel" | "post" | "assembly" | "board" | "m" | "m2";

export interface FeatureQuantityLine {
  key: string;
  kind: FeatureQuantityKind;
  component: string;
  description: string;
  quantity: number;
  unit: FeatureQuantityUnit;
  relatedIds?: string[] | undefined;
}

export interface TwinBarCutSection {
  segmentId: string;
  startOffsetMm: number;
  endOffsetMm: number;
  lengthMm: number;
  fenceHeightKey?: FenceHeightKey | undefined;
  panelHeightMm?: number | undefined;
  lift?: "GROUND" | "FIRST" | "SECOND" | undefined;
}

export interface TwinBarOptimizationCut {
  id: string;
  step: number;
  mode: "OPEN_STOCK_PANEL" | "REUSE_OFFCUT";
  demand: TwinBarCutSection;
  lengthMm: number;
  effectiveLengthMm: number;
  offcutBeforeMm: number;
  offcutAfterMm: number;
}

export interface TwinBarOptimizationPlan {
  id: string;
  variant: TwinBarVariant;
  stockPanelHeightMm: number;
  stockPanelWidthMm: number;
  cuts: TwinBarOptimizationCut[];
  consumedMm: number;
  leftoverMm: number;
  reusableLeftoverMm: number;
  reusedCuts: number;
  panelsSaved: number;
}

export interface TwinBarOptimizationBucket {
  variant: TwinBarVariant;
  stockPanelHeightMm: number;
  solver: "EXACT_SEARCH" | "BEST_FIT_DECREASING";
  fullPanels: number;
  cutDemands: number;
  stockPanelsOpened: number;
  reusedCuts: number;
  baselinePanels: number;
  optimizedPanels: number;
  panelsSaved: number;
  totalConsumedMm: number;
  totalLeftoverMm: number;
  reusableLeftoverMm: number;
  utilizationRate: number;
  plans: TwinBarOptimizationPlan[];
}

export interface OptimizationSummary {
  strategy: "CHAINED_CUT_PLANNER";
  twinBar: {
    reuseAllowanceMm: number;
    stockPanelWidthMm: number;
    fixedFullPanels: number;
    baselinePanels: number;
    optimizedPanels: number;
    panelsSaved: number;
    totalCutDemands: number;
    stockPanelsOpened: number;
    reusedCuts: number;
    totalConsumedMm: number;
    totalLeftoverMm: number;
    reusableLeftoverMm: number;
    utilizationRate: number;
    buckets: TwinBarOptimizationBucket[];
  };
}

export interface PostSummary {
  terminal: number;
  intermediate: number;
  total: number;
  cornerPosts: number;
  byHeightAndType: Record<
    string,
    {
      end: number;
      intermediate: number;
      corner: number;
      junction: number;
      inlineJoin: number;
      total: number;
    }
  >;
  byHeightMm: Record<string, number>;
}

export interface EstimateResult {
  posts: PostSummary;
  corners: CornerSummary;
  materials: MaterialSummary;
  featureQuantities?: FeatureQuantityLine[] | undefined;
  optimization: OptimizationSummary;
  segments: SegmentEstimate[];
}

export interface EstimateSnapshot {
  id: string;
  createdAtIso: string;
  layout: LayoutModel;
  estimate: EstimateResult;
}

export const DRAWING_SCHEMA_VERSION = 1;


// -----------------------------------------------------------------------------
// Estimate commercial inputs
// -----------------------------------------------------------------------------

export interface EstimateCommercialInputs {
  labourOverheadPercent?: number | undefined;
  labourDayValue?: number | undefined;
  travelLodgePerDay: number;
  markupRate: number;
  distributionCharge: number;
  concretePricePerCube: number;
  hardDigRatePerHole?: number | undefined;
  clearSpoilsRatePerHole?: number | undefined;
  travelDays?: number | undefined;
  markupUnits?: number | undefined;
  hardDig?: boolean | undefined;
  clearSpoils?: boolean | undefined;
  externalCornersEnabled?: boolean | undefined;
}

// -----------------------------------------------------------------------------
// Identity & tenancy
// -----------------------------------------------------------------------------

export const USER_ROLES = ["ADMIN", "USER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface CompanyRecord {
  id: string;
  name: string;
  createdAtIso: string;
}

export interface CompanyUserRecord {
  id: string;
  companyId: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAtIso: string;
}

export interface AuthSessionRecord {
  id: string;
  companyId: string;
  userId: string;
  createdAtIso: string;
  expiresAtIso: string;
  revokedAtIso?: string | null;
}

export interface AuthSessionEnvelope {
  company: CompanyRecord;
  user: CompanyUserRecord;
  session: AuthSessionRecord;
}

// -----------------------------------------------------------------------------
// Customers
// -----------------------------------------------------------------------------

export interface CustomerRecord {
  id: string;
  companyId: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  siteAddress: string | null;
  notes: string | null;
  isArchived: boolean;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CustomerSummary extends CustomerRecord {
  siteCount: number;
  projectCount: number;
  activeProjectCount: number;
  lastActivityAtIso: string | null;
}

// -----------------------------------------------------------------------------
// Sites
// -----------------------------------------------------------------------------

export interface SiteRecord {
  id: string;
  companyId: string;
  customerId: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  countryCode: string;
  notes: string | null;
  isArchived: boolean;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SiteSummary extends SiteRecord {
  projectCount: number;
  activeProjectCount: number;
  lastActivityAtIso: string | null;
}

// -----------------------------------------------------------------------------
// Projects / opportunities
// -----------------------------------------------------------------------------

export const PROJECT_STATUSES = [
  "ENQUIRY",
  "SURVEY",
  "ESTIMATING",
  "QUOTED",
  "WON",
  "LOST",
  "ON_HOLD",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ENQUIRY: "Enquiry",
  SURVEY: "Survey",
  ESTIMATING: "Estimating",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
  ON_HOLD: "On hold",
};

export interface ProjectRecord {
  id: string;
  companyId: string;
  customerId: string;
  siteId: string | null;
  reference: string;
  name: string;
  status: ProjectStatus;
  scope: string | null;
  targetDateIso: string | null;
  notes: string | null;
  isArchived: boolean;
  statusChangedAtIso: string | null;
  statusChangedByUserId: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ProjectSummary extends ProjectRecord {
  customerName: string;
  siteName: string | null;
  designCount: number;
  estimateCount: number;
  quoteCount: number;
  /** @deprecated Use designCount. Kept during the drawing-to-design API transition. */
  drawingCount: number;
  lastActivityAtIso: string | null;
}

// -----------------------------------------------------------------------------
// Drawings & revisions
// -----------------------------------------------------------------------------
//
// A Drawing is a named design that belongs to a Project.
// A Drawing has one or more DrawingRevisions. Revision 1 is the root.
// Starting a new revision forks the layout of the current revision.
// Only the latest revision is editable; older revisions are read-only history.

export const DESIGN_STATUSES = ["WORKING", "READY", "SUPERSEDED"] as const;
export type DesignStatus = (typeof DESIGN_STATUSES)[number];

export const DESIGN_STATUS_LABELS: Record<DesignStatus, string> = {
  WORKING: "Working",
  READY: "Ready for estimating",
  SUPERSEDED: "Superseded",
};

export interface DrawingRecord {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  status: DesignStatus;
  currentRevisionId: string;
  latestRevisionNumber: number;
  isArchived: boolean;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface DrawingRevisionRecord {
  id: string;
  drawingId: string;
  companyId: string;
  revisionNumber: number;
  parentRevisionId: string | null;
  notes: string | null;
  layout: LayoutModel;
  savedViewport: DrawingCanvasViewport | null;
  estimate: EstimateResult;
  schemaVersion: number;
  rulesVersion: string;
  versionNumber: number;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface DrawingSummary {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  status: DesignStatus;
  currentRevisionId: string;
  latestRevisionNumber: number;
  segmentCount: number;
  gateCount: number;
  previewLayout: LayoutModel;
  isArchived: boolean;
  createdByUserId: string;
  createdByDisplayName: string;
  updatedByUserId: string;
  updatedByDisplayName: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface DrawingRevisionSummary {
  id: string;
  drawingId: string;
  revisionNumber: number;
  parentRevisionId: string | null;
  notes: string | null;
  segmentCount: number;
  gateCount: number;
  versionNumber: number;
  createdByUserId: string;
  createdByDisplayName: string;
  updatedByUserId: string;
  updatedByDisplayName: string;
  createdAtIso: string;
  updatedAtIso: string;
}

// -----------------------------------------------------------------------------
// Estimate lifecycle
// -----------------------------------------------------------------------------

export const ESTIMATE_VERSION_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "SUPERSEDED",
] as const;
export type EstimateVersionStatus = (typeof ESTIMATE_VERSION_STATUSES)[number];

export const ESTIMATE_VERSION_STATUS_LABELS: Record<EstimateVersionStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  SUPERSEDED: "Superseded",
};

export interface EstimateDesignRevisionSelection {
  drawingId: string;
  drawingName: string;
  drawingRevisionId: string;
  revisionNumber: number;
  position: number;
}

export interface EstimateRecord {
  id: string;
  companyId: string;
  projectId: string;
  reference: string;
  name: string;
  currentVersionId: string;
  latestVersionNumber: number;
  isArchived: boolean;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface EstimateVersionRecord {
  id: string;
  companyId: string;
  estimateId: string;
  versionNumber: number;
  parentVersionId: string | null;
  status: EstimateVersionStatus;
  notes: string | null;
  designRevisionSelections: EstimateDesignRevisionSelection[];
  commercialDraft: import("./estimating.js").EstimateCommercialDraft;
  calculation: import("./estimating.js").CommercialEstimateCalculation | null;
  calculatedAtIso: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface EstimateSummary extends EstimateRecord {
  currentStatus: EstimateVersionStatus;
  selectedDesignCount: number;
}

// -----------------------------------------------------------------------------
// Quote lifecycle
// -----------------------------------------------------------------------------

export const QUOTE_VERSION_STATUSES = [
  "DRAFT",
  "ISSUED",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "SUPERSEDED",
] as const;
export type QuoteVersionStatus = (typeof QUOTE_VERSION_STATUSES)[number];

export const QUOTE_VERSION_STATUS_LABELS: Record<QuoteVersionStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  SUPERSEDED: "Superseded",
};

export interface QuoteRecord {
  id: string;
  companyId: string;
  projectId: string;
  estimateId: string;
  reference: string;
  name: string;
  currentVersionId: string;
  latestVersionNumber: number;
  isArchived: boolean;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface QuoteVersionRecord {
  id: string;
  companyId: string;
  quoteId: string;
  versionNumber: number;
  parentVersionId: string | null;
  estimateVersionId: string;
  status: QuoteVersionStatus;
  title: string;
  customerMessage: string | null;
  validUntilIso: string | null;
  issuedAtIso: string | null;
  decidedAtIso: string | null;
  presentation: import("./estimating.js").QuotePresentationSnapshot;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface QuoteSummary extends QuoteRecord {
  currentStatus: QuoteVersionStatus;
  estimateReference: string;
  estimateVersionNumber: number;
  validUntilIso: string | null;
}

// -----------------------------------------------------------------------------
// Audit log (slim)
// -----------------------------------------------------------------------------

export type AuditEntityType =
  | "AUTH"
  | "USER"
  | "CUSTOMER"
  | "SITE"
  | "PROJECT"
  | "DRAWING"
  | "REVISION"
  | "ESTIMATE"
  | "QUOTE"
  | "CONFIGURATION";

export type AuditAction =
  | "OWNER_BOOTSTRAPPED"
  | "LOGIN_SUCCEEDED"
  | "SESSION_REVOKED"
  | "USER_CREATED"
  | "USER_PASSWORD_RESET"
  | "CUSTOMER_CREATED"
  | "CUSTOMER_UPDATED"
  | "CUSTOMER_ARCHIVED"
  | "CUSTOMER_UNARCHIVED"
  | "CUSTOMER_DELETED"
  | "SITE_CREATED"
  | "SITE_UPDATED"
  | "SITE_ARCHIVED"
  | "SITE_UNARCHIVED"
  | "SITE_DELETED"
  | "PROJECT_CREATED"
  | "PROJECT_UPDATED"
  | "PROJECT_STATUS_CHANGED"
  | "PROJECT_ARCHIVED"
  | "PROJECT_UNARCHIVED"
  | "PROJECT_DELETED"
  | "DRAWING_CREATED"
  | "DRAWING_RENAMED"
  | "DRAWING_STATUS_CHANGED"
  | "DRAWING_ARCHIVED"
  | "DRAWING_UNARCHIVED"
  | "DRAWING_DELETED"
  | "REVISION_CREATED"
  | "REVISION_UPDATED"
  | "REVISION_DELETED"
  | "ESTIMATE_CREATED"
  | "ESTIMATE_CALCULATED"
  | "ESTIMATE_UPDATED"
  | "ESTIMATE_STATUS_CHANGED"
  | "ESTIMATE_VERSION_CREATED"
  | "ESTIMATE_ARCHIVED"
  | "ESTIMATE_UNARCHIVED"
  | "QUOTE_CREATED"
  | "QUOTE_UPDATED"
  | "QUOTE_STATUS_CHANGED"
  | "QUOTE_VERSION_CREATED"
  | "QUOTE_ARCHIVED"
  | "QUOTE_UNARCHIVED"
  | "CONFIGURATION_DRAFT_UPDATED"
  | "CONFIGURATION_TEMPLATE_CLONED"
  | "CONFIGURATION_PUBLISHED";

export interface AuditLogRecord {
  id: string;
  companyId: string;
  actorUserId: string | null;
  entityType: AuditEntityType;
  entityId: string | null;
  action: AuditAction;
  summary: string;
  createdAtIso: string;
  metadata?: Record<string, string | number | boolean | null>;
}
