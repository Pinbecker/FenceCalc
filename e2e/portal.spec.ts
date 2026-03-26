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

async function expectCustomerPickerState(page: Page, open: boolean) {
  const modal = page.getByRole("dialog", { name: "Customer picker" });
  if (open) {
    await expect(modal).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
    return;
  }

  await expect(modal).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe("");
}

test("covers bootstrap, admin user setup, customer-scoped drawing flows, and the refreshed portal views", async ({ page }) => {
  test.setTimeout(60_000);

  await bootstrapOrLoginOwner(page);
  await expect(page.getByRole("heading", { name: "Welcome, Owner User" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest company drawings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent changes" })).toBeVisible();

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
  await expectCustomerPickerState(page, true);
  const customerPicker = page.getByRole("dialog", { name: "Customer picker" });
  await customerPicker.getByRole("button", { name: "New customer" }).click();
  await customerPicker.getByLabel("Customer name").fill("Operations Yard");
  await customerPicker.getByRole("button", { name: "Create customer" }).click();
  await expectCustomerPickerState(page, false);
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();

  await page.getByRole("button", { name: "New drawing" }).click();
  const createDrawingDialog = page.getByRole("dialog", { name: "Create Drawing" });
  await expect(createDrawingDialog).toBeVisible();
  await createDrawingDialog.getByLabel("Drawing name").fill("Operations Yard");
  await createDrawingDialog.getByLabel("Customer").selectOption({ label: "Operations Yard" });
  await createDrawingDialog.getByRole("button", { name: "Create drawing" }).click();
  await expect(createDrawingDialog).toBeHidden();

  const editorNav = page.getByRole("navigation", { name: "Editor navigation" });
  await editorNav.getByRole("button", { name: "Customers" }).click();
  await expectCustomerPickerState(page, true);
  await page.locator(".customer-picker-row").filter({ hasText: "Operations Yard" }).click();
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();

  const initialCard = page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard" });
  await initialCard.locator(".portal-customer-drawing-card-head").click();
  await expect(page.locator(".menu-bar-save-pill")).toHaveText("Saved");

  await page.locator(".menu-bar-drawing-name").click();
  await page.locator(".menu-bar-name-input").fill("Operations Yard v2");
  await page.locator(".menu-bar-name-input").press("Enter");
  await expect(page.locator(".menu-bar-save-pill")).toHaveText("Unsaved");

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Save Ctrl+S" }).click();
  await expect(page.locator(".menu-bar-save-pill")).toHaveText("Saved");

  await editorNav.getByRole("button", { name: "Customers" }).click();
  await expectCustomerPickerState(page, true);
  await page.locator(".customer-picker-row").filter({ hasText: "Operations Yard" }).click();
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();
  const drawingCard = page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard v2" });

  await drawingCard.getByRole("button", { name: "Archive" }).click();
  await expect(page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard" })).toHaveCount(0);

  await page.getByRole("button", { name: "Archived" }).click();
  const archivedCard = page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard v2" });
  await expect(archivedCard).toContainText("Archived");

  await archivedCard.getByRole("button", { name: "Unarchive" }).click();

  await page.getByRole("button", { name: "Active" }).click();
  await expect(page.locator(".portal-customer-drawing-card").filter({ hasText: "Operations Yard" })).toHaveCount(1);
  await expect(page).toHaveURL(/#\/customer\?customerId=/);

  const portalNav = page.getByRole("navigation", { name: "Primary" });
  await portalNav.getByRole("button", { name: "Customers" }).click();
  await expectCustomerPickerState(page, true);
  await expect(page.getByRole("heading", { name: "Customer directory" })).toBeVisible();
  await expect(page).toHaveURL(/#\/customers$/);

  await page.keyboard.press("Escape");
  await expectCustomerPickerState(page, false);
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();
  await expect(page).toHaveURL(/#\/customer\?customerId=/);

  await portalNav.getByRole("button", { name: "Customers" }).click();
  await expectCustomerPickerState(page, true);
  await page.locator(".customer-picker-backdrop").click({ position: { x: 6, y: 6 } });
  await expectCustomerPickerState(page, false);
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();

  await portalNav.getByRole("button", { name: "Customers" }).click();
  await expectCustomerPickerState(page, true);
  await page.locator(".customer-picker-row").filter({ hasText: "Operations Yard" }).click();
  await expectCustomerPickerState(page, false);
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();
});

test("keeps dashboard, drawings, and customers usable on a mobile viewport", async ({ page }) => {
  test.setTimeout(60_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await bootstrapOrLoginOwner(page);

  await expect(page.getByRole("heading", { name: "Welcome, Owner User" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New drawing" })).toBeVisible();

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
