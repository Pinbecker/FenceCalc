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
  await expect(page.getByRole("heading", { name: "Welcome, Owner User" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest company workspace activity" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent workspace movement" })).toBeVisible();

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

  await opsUserCard.getByLabel("Temporary password").fill("recoverysecure123");
  await opsUserCard.getByRole("button", { name: "Set password" }).click();
  await expect(
    page.getByText("Reset password for Operations Admin. Their active sessions were revoked.", { exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Log Out" }).click();
  await expect(page.getByRole("heading", { name: "Log in to your workspace" })).toBeVisible();

  await page.getByLabel("Email").fill("ops@example.com");
  await page.getByLabel("Password").fill("recoverysecure123");
  await page.getByRole("button", { name: "Log In" }).click();

  await expect(page.getByRole("banner").getByText("Operations Admin", { exact: true })).toBeVisible();
  await expect(page.getByRole("banner").locator(".portal-user-chip")).toHaveText("Admin");

  primaryNav = page.getByRole("navigation", { name: "Primary" });
  await primaryNav.getByRole("button", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { name: "Customer directory" })).toBeVisible();
  await page.getByRole("button", { name: "New customer" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Operations Yard");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();

  await page.getByRole("button", { name: "New drawing" }).click();
  const createDrawingDialog = page.getByRole("dialog", { name: "New drawing" });
  await expect(createDrawingDialog).toBeVisible();
  await createDrawingDialog.getByLabel("Drawing name").fill("Operations Yard");
  await createDrawingDialog.getByRole("button", { name: "Create drawing" }).click();
  await expect(createDrawingDialog).toBeHidden();
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();
  await page.locator(".portal-customer-drawing-card-preview").first().click();

  const editorNav = page.getByRole("navigation", { name: "Editor navigation" });
  await expect(editorNav).toBeVisible();
  const drawingNameButton = page.locator(".menu-bar-drawing-name");
  await expect(drawingNameButton).toHaveText("Operations Yard");
  await drawingNameButton.click();
  const drawingNameInput = page.locator(".menu-bar-name-input");
  await expect(drawingNameInput).toHaveValue("Operations Yard");
  await drawingNameInput.fill("Operations Yard v2");
  await drawingNameInput.blur();
  await expect(page.locator(".menu-bar-save-pill")).toHaveText("Unsaved");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Save Ctrl+S" }).click();
  await expect(page.locator(".menu-bar-save-pill")).toHaveText("Saved");

  await editorNav.getByRole("button", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { name: "Customer directory" })).toBeVisible();
  const customerRow = page.locator(".portal-customer-directory-row").filter({ hasText: "Operations Yard" });
  await customerRow.getByRole("button", { name: "Open customer" }).click();
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();
  const drawingCard = page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard v2" });

  await drawingCard.getByRole("button", { name: "Archive workspace" }).click();
  await expect(page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard v2" })).toHaveCount(0);

  await page.getByRole("button", { name: "Archived" }).click();
  const archivedCard = page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard v2" });
  await expect(archivedCard).toContainText("Archived");

  await archivedCard.getByRole("button", { name: "Restore workspace" }).click();

  await page.getByRole("button", { name: "Active" }).click();
  await expect(page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard v2" })).toHaveCount(1);
  await expect(page).toHaveURL(/#\/customer\?customerId=/);

  const portalNav = page.getByRole("navigation", { name: "Primary" });
  await portalNav.getByRole("button", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { name: "Customer directory" })).toBeVisible();
  await expect(page).toHaveURL(/#\/customers$/);

  await page.locator(".portal-customer-directory-row").filter({ hasText: "Operations Yard" }).getByRole("button", { name: "Open customer" }).click();
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();
  await expect(page).toHaveURL(/#\/customer\?customerId=/);
});

test("keeps dashboard, drawings, and customers usable on a mobile viewport", async ({ page }) => {
  test.setTimeout(60_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await bootstrapOrLoginOwner(page);

  await expect(page.getByRole("heading", { name: "Welcome, Owner User" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Browse customers" }).first()).toBeVisible();

  const primaryNav = page.getByRole("navigation", { name: "Primary" });
  await primaryNav.getByRole("button", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { name: "Customer directory" })).toBeVisible();
  await expect(page.getByRole("button", { name: /New customer|Close create panel/ })).toBeVisible();

  await page.getByRole("button", { name: "New customer" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Mobile Yard");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(pageHeading(page, "Mobile Yard")).toBeVisible();
  await expect(page.getByRole("button", { name: "New drawing" })).toBeVisible();
});
