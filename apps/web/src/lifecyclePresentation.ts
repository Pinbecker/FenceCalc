import type {
  DesignStatus,
  EstimateVersionStatus,
  ProjectStatus,
  QuoteVersionStatus,
  SiteRecord,
} from "@fence-estimator/contracts";

export type BadgeTone =
  | "default"
  | "secondary"
  | "muted"
  | "success"
  | "warning"
  | "destructive"
  | "outline";

export const PROJECT_STATUS_TONES: Record<ProjectStatus, BadgeTone> = {
  ENQUIRY: "muted",
  SURVEY: "secondary",
  ESTIMATING: "warning",
  QUOTED: "default",
  WON: "success",
  LOST: "destructive",
  ON_HOLD: "outline",
};

export const DESIGN_STATUS_TONES: Record<DesignStatus, BadgeTone> = {
  WORKING: "warning",
  READY: "success",
  SUPERSEDED: "muted",
};

export const ESTIMATE_STATUS_TONES: Record<EstimateVersionStatus, BadgeTone> = {
  DRAFT: "muted",
  IN_REVIEW: "warning",
  APPROVED: "success",
  SUPERSEDED: "outline",
};

export const QUOTE_STATUS_TONES: Record<QuoteVersionStatus, BadgeTone> = {
  DRAFT: "muted",
  ISSUED: "default",
  ACCEPTED: "success",
  REJECTED: "destructive",
  EXPIRED: "warning",
  SUPERSEDED: "outline",
};

export function formatSiteAddress(site: Pick<
  SiteRecord,
  "addressLine1" | "addressLine2" | "city" | "county" | "postcode" | "countryCode"
>): string {
  return [
    site.addressLine1,
    site.addressLine2,
    site.city,
    site.county,
    site.postcode,
    site.countryCode !== "GB" ? site.countryCode : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

export function formatDateOnly(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
