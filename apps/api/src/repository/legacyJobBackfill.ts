import Database from "better-sqlite3";
import { buildDefaultJobCommercialInputs } from "@fence-estimator/contracts";

interface LegacyDrawingLinkRow {
  id: string;
  company_id: string;
  customer_id: string | null;
  customer_name: string;
  name: string;
  status: string | null;
  is_archived: number;
  archived_at_iso: string | null;
  archived_by_user_id: string | null;
  status_changed_at_iso: string | null;
  status_changed_by_user_id: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
  parent_drawing_id: string | null;
  revision_number: number | null;
  job_id: string | null;
  job_role: string | null;
}

interface LegacyChainState {
  companyId: string;
  rootDrawingId: string;
  rootDrawing: LegacyDrawingLinkRow;
  drawings: LegacyDrawingLinkRow[];
  blockedReason: string | null;
  customerIds: string[];
  usableRealJobIds: string[];
  canonicalJobId: string | null;
  needsBackfill: boolean;
}

interface LegacyDrawingReference {
  id: string;
  companyId: string;
  name: string;
}

interface LegacyChainIssue {
  companyId: string;
  rootDrawingId: string;
  drawingIds: string[];
}

export interface LegacyJobDrawingAudit {
  totalDrawings: number;
  drawingsMissingCustomer: LegacyDrawingReference[];
  drawingsMissingJob: LegacyDrawingReference[];
  chainsWithMixedCustomers: Array<LegacyChainIssue & { customerIds: string[] }>;
  chainsWithMultipleRealJobs: Array<LegacyChainIssue & { jobIds: string[] }>;
  backfillableChainCount: number;
  stalePlaceholderJobCount: number;
}

export interface LegacyJobDrawingBackfillResult {
  createdJobs: number;
  updatedDrawings: number;
  updatedQuotes: number;
  removedPlaceholderJobs: number;
  blockedDrawingIds: string[];
}

function tableExists(database: Database.Database, tableName: string): boolean {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;
  return Boolean(row);
}

function hasColumn(database: Database.Database, tableName: string, columnName: string): boolean {
  if (!tableExists(database, tableName)) {
    return false;
  }
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  return columns.some((column) => column.name === columnName);
}

function normalizeIdentifier(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeDrawingJobRole(value: string | null | undefined): "PRIMARY" | "SECONDARY" | null {
  if (value === "PRIMARY" || value === "SECONDARY") {
    return value;
  }
  return null;
}

function isPlaceholderJobId(jobId: string): boolean {
  return jobId.startsWith("job:");
}

function resolveRootDrawingId(
  drawing: LegacyDrawingLinkRow,
  drawingsById: Map<string, LegacyDrawingLinkRow>,
): string {
  let current = drawing;
  const visited = new Set<string>([drawing.id]);

  while (true) {
    const parentDrawingId = normalizeIdentifier(current.parent_drawing_id);
    if (!parentDrawingId) {
      return current.id;
    }
    const parent = drawingsById.get(parentDrawingId);
    if (!parent || parent.company_id !== drawing.company_id || visited.has(parent.id)) {
      return current.id;
    }
    visited.add(parent.id);
    current = parent;
  }
}

function mapDrawingStatusToJobStage(status: string | null | undefined): string {
  switch (status) {
    case "QUOTED":
    case "WON":
    case "LOST":
    case "ON_HOLD":
      return status;
    default:
      return "DRAFT";
  }
}

function listDrawings(database: Database.Database): LegacyDrawingLinkRow[] {
  if (!tableExists(database, "drawings")) {
    return [];
  }
  return database
    .prepare(
      `
        SELECT
          id,
          company_id,
          customer_id,
          customer_name,
          name,
          status,
          is_archived,
          archived_at_iso,
          archived_by_user_id,
          status_changed_at_iso,
          status_changed_by_user_id,
          created_by_user_id,
          updated_by_user_id,
          created_at_iso,
          updated_at_iso,
          parent_drawing_id,
          revision_number,
          job_id,
          job_role
        FROM drawings
      `,
    )
    .all() as LegacyDrawingLinkRow[];
}

function collectLegacyChainState(database: Database.Database) {
  const drawings = listDrawings(database);
  const drawingsById = new Map(drawings.map((drawing) => [drawing.id, drawing] as const));
  const existingJobs = new Set<string>();
  if (tableExists(database, "jobs")) {
    const jobRows = database.prepare("SELECT id FROM jobs").all() as Array<{ id: string }>;
    for (const job of jobRows) {
      existingJobs.add(job.id);
    }
  }
  const customerNamesById = new Map<string, string>();
  if (tableExists(database, "customers")) {
    const customerRows = database
      .prepare("SELECT id, name FROM customers")
      .all() as Array<{ id: string; name: string }>;
    for (const customer of customerRows) {
      customerNamesById.set(customer.id, customer.name);
    }
  }

  const chains = new Map<string, LegacyChainState>();
  for (const drawing of drawings) {
    const rootDrawingId = resolveRootDrawingId(drawing, drawingsById);
    const key = `${drawing.company_id}:${rootDrawingId}`;
    const rootDrawing = drawingsById.get(rootDrawingId) ?? drawing;
    const chain = chains.get(key);
    if (chain) {
      chain.drawings.push(drawing);
      continue;
    }
    chains.set(key, {
      companyId: drawing.company_id,
      rootDrawingId,
      rootDrawing,
      drawings: [drawing],
      blockedReason: null,
      customerIds: [],
      usableRealJobIds: [],
      canonicalJobId: null,
      needsBackfill: false,
    });
  }

  for (const chain of chains.values()) {
    chain.drawings.sort((left, right) => {
      if (left.id === chain.rootDrawingId) {
        return -1;
      }
      if (right.id === chain.rootDrawingId) {
        return 1;
      }
      if ((left.revision_number ?? 0) !== (right.revision_number ?? 0)) {
        return (left.revision_number ?? 0) - (right.revision_number ?? 0);
      }
      return left.created_at_iso.localeCompare(right.created_at_iso);
    });

    const customerIds = [
      ...new Set(
        chain.drawings
          .map((drawing) => normalizeIdentifier(drawing.customer_id))
          .filter((value): value is string => value !== null),
      ),
    ];
    const linkedJobIds = [
      ...new Set(
        chain.drawings
          .map((drawing) => normalizeIdentifier(drawing.job_id))
          .filter((value): value is string => value !== null),
      ),
    ];
    const usableRealJobIds = linkedJobIds.filter(
      (jobId) => !isPlaceholderJobId(jobId) && existingJobs.has(jobId),
    );

    chain.customerIds = customerIds;
    chain.usableRealJobIds = usableRealJobIds;

    if (chain.drawings.some((drawing) => normalizeIdentifier(drawing.customer_id) === null)) {
      chain.blockedReason = "missing_customer";
      continue;
    }
    if (customerIds.length > 1) {
      chain.blockedReason = "mixed_customers";
      continue;
    }
    if (usableRealJobIds.length > 1) {
      chain.blockedReason = "multiple_real_jobs";
      continue;
    }

    chain.canonicalJobId =
      usableRealJobIds[0] ?? `legacy-job:${chain.rootDrawingId}`;

    const canonicalJobExists = existingJobs.has(chain.canonicalJobId);
    chain.needsBackfill =
      !canonicalJobExists ||
      chain.drawings.some((drawing) => {
        const desiredRole = drawing.id === chain.rootDrawingId ? "PRIMARY" : "SECONDARY";
        return (
          normalizeIdentifier(drawing.job_id) !== chain.canonicalJobId ||
          normalizeDrawingJobRole(drawing.job_role) !== desiredRole
        );
      });

    const resolvedCustomerName =
      customerNamesById.get(customerIds[0] ?? "") ??
      normalizeIdentifier(chain.rootDrawing.customer_name) ??
      chain.rootDrawing.name;
    chain.rootDrawing = {
      ...chain.rootDrawing,
      customer_name: resolvedCustomerName,
    };
  }

  const stalePlaceholderJobCount =
    tableExists(database, "jobs") && tableExists(database, "drawings")
      ? ((database
          .prepare(
            `
              SELECT COUNT(*) AS total
              FROM jobs
              WHERE id LIKE 'job:%'
                AND NOT EXISTS (
                  SELECT 1
                  FROM drawings
                  WHERE drawings.company_id = jobs.company_id
                    AND drawings.job_id = jobs.id
                )
            `,
          )
          .get() as { total: number }).total ?? 0)
      : 0;

  return {
    drawings,
    chains: [...chains.values()],
    stalePlaceholderJobCount,
  };
}

export function auditLegacyJobDrawingLinks(database: Database.Database): LegacyJobDrawingAudit {
  const state = collectLegacyChainState(database);
  const drawingsMissingCustomer = state.drawings
    .filter((drawing) => normalizeIdentifier(drawing.customer_id) === null)
    .map((drawing) => ({
      id: drawing.id,
      companyId: drawing.company_id,
      name: drawing.name,
    }));
  const drawingsMissingJob = state.drawings
    .filter((drawing) => {
      const customerId = normalizeIdentifier(drawing.customer_id);
      const jobId = normalizeIdentifier(drawing.job_id);
      return customerId !== null && jobId === null;
    })
    .map((drawing) => ({
      id: drawing.id,
      companyId: drawing.company_id,
      name: drawing.name,
    }));

  return {
    totalDrawings: state.drawings.length,
    drawingsMissingCustomer,
    drawingsMissingJob,
    chainsWithMixedCustomers: state.chains
      .filter((chain) => chain.blockedReason === "mixed_customers")
      .map((chain) => ({
        companyId: chain.companyId,
        rootDrawingId: chain.rootDrawingId,
        drawingIds: chain.drawings.map((drawing) => drawing.id),
        customerIds: chain.customerIds,
      })),
    chainsWithMultipleRealJobs: state.chains
      .filter((chain) => chain.blockedReason === "multiple_real_jobs")
      .map((chain) => ({
        companyId: chain.companyId,
        rootDrawingId: chain.rootDrawingId,
        drawingIds: chain.drawings.map((drawing) => drawing.id),
        jobIds: chain.usableRealJobIds,
      })),
    backfillableChainCount: state.chains.filter((chain) => chain.needsBackfill && !chain.blockedReason)
      .length,
    stalePlaceholderJobCount: state.stalePlaceholderJobCount,
  };
}

export function backfillLegacyJobDrawingLinks(
  database: Database.Database,
): LegacyJobDrawingBackfillResult {
  if (!tableExists(database, "drawings") || !tableExists(database, "jobs")) {
    return {
      createdJobs: 0,
      updatedDrawings: 0,
      updatedQuotes: 0,
      removedPlaceholderJobs: 0,
      blockedDrawingIds: [],
    };
  }

  const state = collectLegacyChainState(database);
  const defaultCommercialInputsJson = JSON.stringify(buildDefaultJobCommercialInputs());
  const existingJobIds = new Set(
    (database.prepare("SELECT id FROM jobs").all() as Array<{ id: string }>).map((row) => row.id),
  );
  const upsertLegacyJob = database.prepare(
    `
      INSERT INTO jobs (
        id,
        company_id,
        customer_id,
        customer_name,
        name,
        stage,
        primary_drawing_id,
        commercial_inputs_json,
        notes,
        owner_user_id,
        is_archived,
        archived_at_iso,
        archived_by_user_id,
        stage_changed_at_iso,
        stage_changed_by_user_id,
        created_by_user_id,
        updated_by_user_id,
        created_at_iso,
        updated_at_iso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        customer_id = excluded.customer_id,
        customer_name = excluded.customer_name,
        name = excluded.name,
        stage = excluded.stage,
        primary_drawing_id = excluded.primary_drawing_id,
        commercial_inputs_json = excluded.commercial_inputs_json,
        notes = excluded.notes,
        owner_user_id = excluded.owner_user_id,
        is_archived = excluded.is_archived,
        archived_at_iso = excluded.archived_at_iso,
        archived_by_user_id = excluded.archived_by_user_id,
        stage_changed_at_iso = excluded.stage_changed_at_iso,
        stage_changed_by_user_id = excluded.stage_changed_by_user_id,
        created_by_user_id = excluded.created_by_user_id,
        updated_by_user_id = excluded.updated_by_user_id,
        created_at_iso = excluded.created_at_iso,
        updated_at_iso = excluded.updated_at_iso
    `,
  );
  const updateDrawingLink = database.prepare(
    `
      UPDATE drawings
      SET job_id = ?, job_role = ?
      WHERE id = ? AND company_id = ?
    `,
  );
  const updateQuoteSourceDrawing = tableExists(database, "quotes") && hasColumn(database, "quotes", "source_drawing_id")
    ? database.prepare(
        `
          UPDATE quotes
          SET source_drawing_id = drawing_id
          WHERE source_drawing_id IS NULL OR TRIM(COALESCE(source_drawing_id, '')) = ''
        `,
      )
    : null;
  const updateQuoteSourceVersion = tableExists(database, "quotes") &&
    hasColumn(database, "quotes", "source_drawing_version_number")
    ? database.prepare(
        `
          UPDATE quotes
          SET source_drawing_version_number = drawing_version_number
          WHERE source_drawing_version_number IS NULL
        `,
      )
    : null;
  const updateQuoteJobId = tableExists(database, "quotes") && hasColumn(database, "quotes", "job_id")
    ? database.prepare(
        `
          UPDATE quotes
          SET job_id = (
            SELECT drawings.job_id
            FROM drawings
            WHERE drawings.company_id = quotes.company_id
              AND drawings.id = COALESCE(NULLIF(TRIM(quotes.source_drawing_id), ''), quotes.drawing_id)
            LIMIT 1
          )
          WHERE EXISTS (
            SELECT 1
            FROM drawings
            WHERE drawings.company_id = quotes.company_id
              AND drawings.id = COALESCE(NULLIF(TRIM(quotes.source_drawing_id), ''), quotes.drawing_id)
              AND TRIM(COALESCE(drawings.job_id, '')) <> ''
          )
        `,
      )
    : null;
  const deleteStalePlaceholderJobs = database.prepare(
    `
      DELETE FROM jobs
      WHERE id LIKE 'job:%'
        AND NOT EXISTS (
          SELECT 1
          FROM drawings
          WHERE drawings.company_id = jobs.company_id
            AND drawings.job_id = jobs.id
        )
    `,
  );

  let createdJobs = 0;
  let updatedDrawings = 0;
  const blockedDrawingIds: string[] = [];

  for (const chain of state.chains) {
    if (chain.blockedReason || !chain.canonicalJobId || chain.customerIds.length !== 1) {
      blockedDrawingIds.push(...chain.drawings.map((drawing) => drawing.id));
      continue;
    }

    if (chain.needsBackfill && chain.usableRealJobIds.length === 0) {
      if (!existingJobIds.has(chain.canonicalJobId)) {
        createdJobs += 1;
        existingJobIds.add(chain.canonicalJobId);
      }
      upsertLegacyJob.run(
        chain.canonicalJobId,
        chain.companyId,
        chain.customerIds[0],
        chain.rootDrawing.customer_name,
        chain.rootDrawing.name,
        mapDrawingStatusToJobStage(chain.rootDrawing.status),
        chain.rootDrawing.id,
        defaultCommercialInputsJson,
        "",
        chain.rootDrawing.created_by_user_id,
        chain.rootDrawing.is_archived,
        chain.rootDrawing.archived_at_iso,
        chain.rootDrawing.archived_by_user_id,
        chain.rootDrawing.status_changed_at_iso ?? chain.rootDrawing.updated_at_iso,
        chain.rootDrawing.status_changed_by_user_id ?? chain.rootDrawing.updated_by_user_id,
        chain.rootDrawing.created_by_user_id,
        chain.rootDrawing.updated_by_user_id,
        chain.rootDrawing.created_at_iso,
        chain.rootDrawing.updated_at_iso,
      );
    }

    for (const drawing of chain.drawings) {
      const desiredRole = drawing.id === chain.rootDrawingId ? "PRIMARY" : "SECONDARY";
      if (
        normalizeIdentifier(drawing.job_id) === chain.canonicalJobId &&
        normalizeDrawingJobRole(drawing.job_role) === desiredRole
      ) {
        continue;
      }
      const result = updateDrawingLink.run(
        chain.canonicalJobId,
        desiredRole,
        drawing.id,
        drawing.company_id,
      ) as Database.RunResult;
      updatedDrawings += result.changes;
    }
  }

  const updatedQuotes =
    (updateQuoteSourceDrawing?.run() as Database.RunResult | undefined)?.changes ?? 0 +
    ((updateQuoteSourceVersion?.run() as Database.RunResult | undefined)?.changes ?? 0) +
    ((updateQuoteJobId?.run() as Database.RunResult | undefined)?.changes ?? 0);
  const removedPlaceholderJobs = (deleteStalePlaceholderJobs.run() as Database.RunResult).changes;

  return {
    createdJobs,
    updatedDrawings,
    updatedQuotes,
    removedPlaceholderJobs,
    blockedDrawingIds,
  };
}
