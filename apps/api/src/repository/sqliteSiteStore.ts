import type Database from "better-sqlite3";
import type { SiteRecord, SiteSummary } from "@fence-estimator/contracts";

import type { SiteRow, SiteSummaryRow } from "./shared.js";
import { toSite, toSiteSummary } from "./shared.js";
import type {
  CreateSiteInput,
  DeleteSiteInput,
  ScopeFilter,
  SetSiteArchivedStateInput,
  UpdateSiteInput,
} from "./types.js";

const SUMMARY_SELECT = `
  SELECT
    s.*,
    (SELECT COUNT(*) FROM projects p WHERE p.site_id = s.id) AS project_count,
    (SELECT COUNT(*) FROM projects p WHERE p.site_id = s.id AND p.is_archived = 0) AS active_project_count,
    (SELECT MAX(p.updated_at_iso) FROM projects p WHERE p.site_id = s.id) AS last_activity_at_iso
  FROM sites s
`;

export class SqliteSiteStore {
  public constructor(private readonly database: Database.Database) {}

  public createSite(input: CreateSiteInput): SiteRecord {
    this.database
      .prepare(`
        INSERT INTO sites (
          id, company_id, customer_id, name, address_line_1, address_line_2, city, county,
          postcode, country_code, notes, is_archived, created_by_user_id, updated_by_user_id,
          created_at_iso, updated_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `)
      .run(
        input.id,
        input.companyId,
        input.customerId,
        input.name,
        input.addressLine1,
        input.addressLine2,
        input.city,
        input.county,
        input.postcode,
        input.countryCode,
        input.notes,
        input.createdByUserId,
        input.updatedByUserId,
        input.createdAtIso,
        input.updatedAtIso,
      );
    return this.getSiteById(input.id, input.companyId)!;
  }

  public listSites(
    companyId: string,
    options: { scope?: ScopeFilter; customerId?: string; search?: string } = {},
  ): SiteSummary[] {
    const { scope = "ACTIVE", customerId, search } = options;
    const where = ["s.company_id = ?"];
    const values: string[] = [companyId];
    if (scope === "ACTIVE") where.push("s.is_archived = 0");
    if (scope === "ARCHIVED") where.push("s.is_archived = 1");
    if (customerId) {
      where.push("s.customer_id = ?");
      values.push(customerId);
    }
    const needle = search?.trim().toLowerCase();
    if (needle) {
      where.push(`(
        LOWER(s.name) LIKE ? OR LOWER(COALESCE(s.address_line_1, '')) LIKE ?
        OR LOWER(COALESCE(s.city, '')) LIKE ? OR LOWER(COALESCE(s.postcode, '')) LIKE ?
      )`);
      const pattern = `%${needle}%`;
      values.push(pattern, pattern, pattern, pattern);
    }
    const rows = this.database
      .prepare(`${SUMMARY_SELECT} WHERE ${where.join(" AND ")} ORDER BY s.name COLLATE NOCASE`)
      .all(...values) as SiteSummaryRow[];
    return rows.map(toSiteSummary);
  }

  public getSiteById(siteId: string, companyId: string): SiteRecord | null {
    const row = this.database
      .prepare("SELECT * FROM sites WHERE id = ? AND company_id = ?")
      .get(siteId, companyId) as SiteRow | undefined;
    return row ? toSite(row) : null;
  }

  public updateSite(input: UpdateSiteInput): SiteRecord | null {
    const existing = this.getSiteById(input.siteId, input.companyId);
    if (!existing) return null;
    const next: SiteRecord = {
      ...existing,
      name: input.name ?? existing.name,
      addressLine1: input.addressLine1 !== undefined ? input.addressLine1 : existing.addressLine1,
      addressLine2: input.addressLine2 !== undefined ? input.addressLine2 : existing.addressLine2,
      city: input.city !== undefined ? input.city : existing.city,
      county: input.county !== undefined ? input.county : existing.county,
      postcode: input.postcode !== undefined ? input.postcode : existing.postcode,
      countryCode: input.countryCode ?? existing.countryCode,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
    this.database
      .prepare(`
        UPDATE sites SET name = ?, address_line_1 = ?, address_line_2 = ?, city = ?, county = ?,
          postcode = ?, country_code = ?, notes = ?, updated_by_user_id = ?, updated_at_iso = ?
        WHERE id = ? AND company_id = ?
      `)
      .run(
        next.name,
        next.addressLine1,
        next.addressLine2,
        next.city,
        next.county,
        next.postcode,
        next.countryCode,
        next.notes,
        next.updatedByUserId,
        next.updatedAtIso,
        input.siteId,
        input.companyId,
      );
    return next;
  }

  public setSiteArchivedState(input: SetSiteArchivedStateInput): SiteRecord | null {
    const existing = this.getSiteById(input.siteId, input.companyId);
    if (!existing) return null;
    if (input.archived) {
      const activeProjects = this.database
        .prepare("SELECT COUNT(*) AS count FROM projects WHERE site_id = ? AND is_archived = 0")
        .get(input.siteId) as { count: number };
      if (activeProjects.count > 0) return null;
    }
    this.database
      .prepare(`
        UPDATE sites SET is_archived = ?, updated_by_user_id = ?, updated_at_iso = ?
        WHERE id = ? AND company_id = ?
      `)
      .run(
        input.archived ? 1 : 0,
        input.updatedByUserId,
        input.updatedAtIso,
        input.siteId,
        input.companyId,
      );
    return {
      ...existing,
      isArchived: input.archived,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }

  public deleteSite(input: DeleteSiteInput): boolean {
    const result = this.database
      .prepare(`
        DELETE FROM sites
        WHERE id = ? AND company_id = ? AND is_archived = 1
          AND NOT EXISTS (SELECT 1 FROM projects WHERE site_id = sites.id)
      `)
      .run(input.siteId, input.companyId);
    return result.changes > 0;
  }
}
