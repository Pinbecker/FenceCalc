export interface PointMm {
  x: number;
  y: number;
}

export type FenceSystem = "TWIN_BAR" | "ROLL_FORM";
export const TWIN_BAR_HEIGHT_KEYS = ["1.2m", "1.8m", "2m", "2.4m", "3m", "4m", "4.5m", "5m", "6m"] as const;
export const ROLL_FORM_HEIGHT_KEYS = ["2m", "3m"] as const;
export const FENCE_HEIGHT_KEYS = ["1.2m", "1.8m", "2m", "2.4m", "3m", "4m", "4.5m", "5m", "6m"] as const;

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

export type GoalUnitWidthMm = (typeof GOAL_UNIT_WIDTHS_MM)[number];
export type GoalUnitHeightMm = (typeof GOAL_UNIT_HEIGHTS_MM)[number];
export type BasketballArmLengthMm = (typeof BASKETBALL_ARM_LENGTHS_MM)[number];
export type KickboardSectionHeightMm = (typeof KICKBOARD_SECTION_HEIGHTS_MM)[number];
export type KickboardProfile = "SQUARE" | "CHAMFERED";
export type BasketballFeatureType = "DEDICATED_POST" | "MOUNTED_TO_EXISTING_POST" | "GOAL_UNIT_INTEGRATED";
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
}

export interface KickboardAttachment {
  id: string;
  segmentId: string;
  sectionHeightMm: KickboardSectionHeightMm;
  thicknessMm: 50;
  profile: KickboardProfile;
  boardLengthMm: 2500;
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
  twinBarPanelsByFenceHeight: Record<string, { standard: number; superRebound: number; total: number }>;
  roll2100: number;
  roll900: number;
  totalRolls: number;
  rollsByFenceHeight: Record<string, { roll2100: number; roll900: number; total: number }>;
}

export type FeatureQuantityKind = "GOAL_UNIT" | "BASKETBALL" | "KICKBOARD" | "PITCH_DIVIDER" | "SIDE_NETTING";
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

export type CompanyUserRole = "OWNER" | "ADMIN" | "MEMBER";

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
  role: CompanyUserRole;
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

export interface CustomerContact {
  name: string;
  phone: string;
  email: string;
}

export interface CustomerRecord {
  id: string;
  companyId: string;
  name: string;
  primaryContactName: string;
  primaryEmail: string;
  primaryPhone: string;
  additionalContacts: CustomerContact[];
  siteAddress: string;
  notes: string;
  isArchived: boolean;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CustomerSummary extends CustomerRecord {
  activeDrawingCount: number;
  archivedDrawingCount: number;
  lastActivityAtIso: string | null;
}

export const JOB_STAGES = ["DRAFT", "DESIGNING", "ESTIMATING", "READY_TO_QUOTE", "QUOTED", "FOLLOW_UP", "WON", "LOST", "ON_HOLD"] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export interface JobCommercialInputs {
  labourOverheadPercent: number;
  travelLodgePerDay: number;
  travelDays: number;
  markupRate: number;
  markupUnits: number;
  distributionCharge: number;
  concretePricePerCube: number;
  hardDig: boolean;
  clearSpoils: boolean;
}

export interface JobRecord {
  id: string;
  companyId: string;
  customerId: string;
  customerName: string;
  name: string;
  stage: JobStage;
  primaryDrawingId: string | null;
  commercialInputs: JobCommercialInputs;
  notes: string;
  ownerUserId: string | null;
  ownerDisplayName: string;
  isArchived: boolean;
  archivedAtIso: string | null;
  archivedByUserId: string | null;
  stageChangedAtIso: string | null;
  stageChangedByUserId: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  updatedByDisplayName: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface JobSummary extends JobRecord {
  drawingCount: number;
  openTaskCount: number;
  completedTaskCount: number;
  lastActivityAtIso: string | null;
  latestQuoteTotal: number | null;
  latestQuoteCreatedAtIso: string | null;
  latestEstimateTotal: number | null;
  primaryDrawingName: string | null;
  primaryDrawingUpdatedAtIso: string | null;
  primaryPreviewLayout: LayoutModel | null;
}

export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export const TASK_PRIORITIES: readonly TaskPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export interface JobTaskRecord {
  id: string;
  companyId: string;
  jobId: string;
  jobName: string;
  title: string;
  description: string;
  priority: TaskPriority;
  isCompleted: boolean;
  assignedUserId: string | null;
  assignedUserDisplayName: string;
  dueAtIso: string | null;
  completedAtIso: string | null;
  completedByUserId: string | null;
  completedByDisplayName: string;
  createdByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export type DrawingJobRole = "PRIMARY" | "SECONDARY";

export interface DrawingRecord {
  id: string;
  companyId: string;
  jobId?: string | null;
  jobRole?: DrawingJobRole | null;
  parentDrawingId?: string | null;
  revisionNumber: number;
  name: string;
  customerId: string | null;
  customerName: string;
  layout: LayoutModel;
  savedViewport?: DrawingCanvasViewport | null;
  estimate: EstimateResult;
  schemaVersion: number;
  rulesVersion: string;
  versionNumber: number;
  status: DrawingStatus;
  isArchived: boolean;
  archivedAtIso: string | null;
  archivedByUserId: string | null;
  statusChangedAtIso: string | null;
  statusChangedByUserId: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface DrawingSummary {
  id: string;
  companyId: string;
  jobId?: string | null;
  jobRole?: DrawingJobRole | null;
  parentDrawingId?: string | null;
  revisionNumber: number;
  name: string;
  customerId: string | null;
  customerName: string;
  previewLayout: LayoutModel;
  segmentCount: number;
  gateCount: number;
  schemaVersion: number;
  rulesVersion: string;
  versionNumber: number;
  status: DrawingStatus;
  isArchived: boolean;
  archivedAtIso: string | null;
  archivedByUserId: string | null;
  statusChangedAtIso: string | null;
  statusChangedByUserId: string | null;
  createdByUserId: string;
  createdByDisplayName: string;
  updatedByUserId: string;
  updatedByDisplayName: string;
  contributorUserIds: string[];
  contributorDisplayNames: string[];
  createdAtIso: string;
  updatedAtIso: string;
}

export const DRAWING_STATUSES = ["DRAFT", "QUOTED", "WON", "LOST", "ON_HOLD"] as const;
export type DrawingStatus = (typeof DRAWING_STATUSES)[number];

export type DrawingVersionSource = "CREATE" | "UPDATE" | "RESTORE";

export interface DrawingVersionRecord {
  id: string;
  drawingId: string;
  companyId: string;
  schemaVersion: number;
  rulesVersion: string;
  versionNumber: number;
  source: DrawingVersionSource;
  name: string;
  customerId: string | null;
  customerName: string;
  layout: LayoutModel;
  savedViewport?: DrawingCanvasViewport | null;
  estimate: EstimateResult;
  createdByUserId: string;
  createdAtIso: string;
}

export type AuditEntityType = "AUTH" | "USER" | "DRAWING" | "QUOTE" | "CUSTOMER" | "JOB";
export type AuditAction =
  | "OWNER_BOOTSTRAPPED"
  | "LOGIN_SUCCEEDED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "SESSION_REVOKED"
  | "USER_CREATED"
  | "USER_PASSWORD_RESET"
  | "DRAWING_CREATED"
  | "DRAWING_UPDATED"
  | "DRAWING_ARCHIVED"
  | "DRAWING_UNARCHIVED"
  | "DRAWING_STATUS_CHANGED"
  | "DRAWING_VERSION_RESTORED"
  | "QUOTE_CREATED"
  | "JOB_CREATED"
  | "JOB_UPDATED"
  | "JOB_ARCHIVED"
  | "JOB_UNARCHIVED"
  | "JOB_STAGE_CHANGED"
  | "JOB_PRIMARY_DRAWING_CHANGED"
  | "JOB_DRAWING_ADDED"
  | "JOB_TASK_CREATED"
  | "JOB_TASK_UPDATED"
  | "JOB_TASK_DELETED"
  | "JOB_DELETED"
  | "CUSTOMER_CREATED"
  | "CUSTOMER_UPDATED"
  | "CUSTOMER_ARCHIVED"
  | "CUSTOMER_UNARCHIVED"
  | "DRAWING_DELETED"
  | "CUSTOMER_DELETED";

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
