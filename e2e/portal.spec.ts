import { expect, test, type Page } from "@playwright/test";

async function bootstrapOrLoginOwner(page: Page, companyName = "Acme Fencing") {
  await page.goto("/");

  const bootstrapButton = page.getByRole("button", { name: "Create Owner" });
  const loginButton = page.getByRole("button", { name: "Log In" });

  await expect(bootstrapButton.or(loginButton)).toBeVisible();

  if (await bootstrapButton.isVisible()) {
    await page.getByLabel("Bootstrap Secret").fill("test-bootstrap-secret");
    await page.getByLabel("Company Name").fill(companyName);
    await page.getByLabel("Your Name").fill("Owner User");
    await page.getByLabel("Email").fill("owner@example.com");
    await page.getByLabel("Password").fill("supersecure123");
    await bootstrapButton.click();
  } else {
    await page.getByLabel("Email").fill("owner@example.com");
    await page.getByLabel("Password").fill("supersecure123");
    await loginButton.click();
  }

  await expect(page.getByRole("banner").getByText(companyName)).toBeVisible();
}

function pageHeading(page: Page, name: string) {
  return page.locator("h1").filter({ hasText: name });
}

test("covers bootstrap, admin user setup, customer-scoped drawing flows, and the refreshed portal views", async ({ page }) => {
  test.setTimeout(60_000);

  await bootstrapOrLoginOwner(page);
  await expect(page.getByRole("heading", { name: "Active customers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Useful routes" })).toBeVisible();

  let primaryNav = page.getByRole("navigation", { name: "Primary" });
  await primaryNav.getByRole("button", { name: "Admin" }).click();
  await expect(page.getByRole("heading", { name: "User management" })).toBeVisible();

  await page.getByLabel("Name").fill("Operations Admin");
  await page.getByLabel("Email").fill("ops@example.com");
  await page.getByLabel("Password").fill("initialsecure123");
  await page.getByLabel("Role").selectOption("ADMIN");
  await page.getByRole("button", { name: "Add User" }).click();

  const opsUserCard = page.locator(".admin-user-card").filter({ hasText: "Operations Admin" });
  await expect(opsUserCard).toContainText("ops@example.com");
  await expect(page.getByText("Added Operations Admin", { exact: true })).toBeVisible();

  await opsUserCard.getByLabel("Set temporary password").fill("recoverysecure123");
  await opsUserCard.getByRole("button", { name: "Set Password" }).click();
  await expect(
    page.getByText("Reset password for Operations Admin. Their active sessions were revoked.", { exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Log Out" }).click();
  await expect(page.getByRole("heading", { name: "Log in to your workspace" })).toBeVisible();

  await page.getByLabel("Email").fill("ops@example.com");
  await page.getByLabel("Password").fill("recoverysecure123");
  await page.getByRole("button", { name: "Log In" }).click();

  await expect(page.getByRole("banner").getByText("Operations Admin", { exact: true })).toBeVisible();
  await expect(page.getByRole("banner").getByText("ADMIN", { exact: true })).toBeVisible();

  primaryNav = page.getByRole("navigation", { name: "Primary" });
  await primaryNav.getByRole("button", { name: "Editor" }).click();
  await expect(page.getByRole("heading", { name: "New drawing draft" })).toBeVisible();
  await expect(page.getByText("Workspace Editor", { exact: true })).toBeVisible();

  await page.getByLabel("Drawing Name").fill("Operations Yard");
  await page.getByRole("button", { name: "New Customer" }).click();
  await page.getByPlaceholder("Customer name").fill("Operations Yard");
  await page.getByRole("button", { name: "Create Customer" }).click();
  await page.getByRole("button", { name: "Save New" }).click();

  await page.getByRole("button", { name: "Customers" }).click();
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();

  const initialCard = page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard" });
  await initialCard.getByRole("button", { name: "Open editor" }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();

  await page.getByLabel("Drawing Name").fill("Operations Yard v2");
  await page.getByLabel("Drawing Name").press("Tab");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".editor-save-pill")).toHaveText("All changes saved");
  await expect(page.getByRole("button", { name: "Estimate" })).toBeEnabled();

  await page.getByRole("button", { name: "Customers" }).click();
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();
  const drawingCard = page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard v2" });

  await drawingCard.getByRole("button", { name: "History" }).click();
  const versionOneRow = drawingCard.locator(".portal-customer-version-row").filter({ hasText: "v1" });
  await versionOneRow.getByRole("button", { name: "Restore" }).click();

  const restoredCard = page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard" });
  await expect(restoredCard).toContainText("v3");

  await restoredCard.getByRole("button", { name: "Archive" }).click();
  await expect(page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard" })).toHaveCount(0);

  await page.getByRole("button", { name: "Archived" }).click();
  const archivedCard = page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard" });
  await expect(archivedCard).toContainText("Archived");

  await archivedCard.getByRole("button", { name: "Unarchive" }).click();

  await page.getByRole("button", { name: "Active" }).click();
  await expect(page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard" })).toHaveCount(1);

  const portalNav = page.getByRole("navigation", { name: "Primary" });
  await portalNav.getByRole("button", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { name: "Customer directory" })).toBeVisible();
  await page.locator(".customer-picker-row").filter({ hasText: "Operations Yard" }).click();
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();
});

test("keeps dashboard, drawings, and customers usable on a mobile viewport", async ({ page }) => {
  test.setTimeout(60_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await bootstrapOrLoginOwner(page);

  await expect(page.getByRole("heading", { name: "Acme Fencing" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Library" })).toBeVisible();

  const primaryNav = page.getByRole("navigation", { name: "Primary" });
  await primaryNav.getByRole("button", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { name: "Customer directory" })).toBeVisible();
  await expect(page.getByRole("button", { name: /New customer|Cancel/ })).toBeVisible();

  await page.getByRole("button", { name: "New customer" }).click();
  await page.getByLabel("Customer name").fill("Mobile Yard");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(pageHeading(page, "Mobile Yard")).toBeVisible();

  await primaryNav.getByRole("button", { name: "Customers" }).click();
  const customerRow = page.locator(".customer-picker-row").filter({ hasText: "Mobile Yard" });
  await expect(customerRow).toBeVisible();
  await customerRow.click();
  await expect(pageHeading(page, "Mobile Yard")).toBeVisible();
});
