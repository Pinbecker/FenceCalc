import { expect, test, type Page } from "@playwright/test";

async function bootstrapOrLoginOwner(page: Page, companyName = "Acme Fencing") {
  await page.goto("/");

  const bootstrapButton = page.getByRole("button", { name: "Create workspace" });
  const loginButton = page.getByRole("button", { name: "Sign in" });

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

  await expect(pageHeading(page, "Customers")).toBeVisible();
}

function pageHeading(page: Page, name: string) {
  return page.locator("h1").filter({ hasText: name });
}

test("covers bootstrap, user administration, and the customer-to-design lifecycle", async ({
  page,
}) => {
  test.setTimeout(60_000);

  await bootstrapOrLoginOwner(page);
  await expect(pageHeading(page, "Customers")).toBeVisible();

  await page.getByRole("button", { name: "Admin" }).click();
  await expect(pageHeading(page, "Admin")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team members" })).toBeVisible();

  await page.getByRole("button", { name: "Add user" }).click();
  const createUserDialog = page.getByRole("dialog", { name: "Add a user" });
  await createUserDialog.getByLabel("Name").fill("Operations Admin");
  await createUserDialog.getByLabel("Email").fill("ops@example.com");
  await createUserDialog.getByLabel("Temporary password").fill("initialsecure123");
  await createUserDialog.getByLabel("Role").click();
  await page.getByRole("option", { name: "Admin" }).click();
  await createUserDialog.getByRole("button", { name: "Create user" }).click();

  const opsUserRow = page.getByRole("row").filter({ hasText: "Operations Admin" });
  await expect(opsUserRow).toContainText("ops@example.com");
  await expect(page.getByText("Invited Operations Admin", { exact: true })).toBeVisible();

  await opsUserRow.getByRole("button", { name: "Reset password" }).click();
  const resetDialog = page.getByRole("dialog", { name: "Reset password" });
  await resetDialog.getByLabel("New password").fill("recoverysecure123");
  await resetDialog.getByRole("button", { name: "Set password" }).click();
  await expect(
    page.getByText("Password reset for Operations Admin", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /OU Owner User owner@example.com/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Email").fill("ops@example.com");
  await page.getByLabel("Password").fill("recoverysecure123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Operations Admin", { exact: true })).toBeVisible();
  await expect(pageHeading(page, "Customers")).toBeVisible();

  await page.getByRole("button", { name: "Customers" }).click();
  await page.getByRole("button", { name: "New customer" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Operations Yard");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(pageHeading(page, "Operations Yard")).toBeVisible();

  await page.getByRole("button", { name: "Add site" }).first().click();
  const siteDialog = page.getByRole("dialog", { name: "Add site" });
  await siteDialog.getByLabel("Site name").fill("Main works");
  await siteDialog.getByLabel("Postcode").fill("LS1 1AA");
  await siteDialog.getByRole("button", { name: "Add site" }).click();
  await expect(page.getByText("Main works", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "New project" }).click();
  const projectDialog = page.getByRole("dialog", { name: "New project" });
  await projectDialog.getByLabel("Project name").fill("North perimeter renewal");
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await expect(pageHeading(page, "North perimeter renewal")).toBeVisible();

  await page.getByRole("button", { name: "New design" }).click();
  const designDialog = page.getByRole("dialog", { name: "New design" });
  await designDialog.getByLabel("Design name").fill("Tennis courts perimeter");
  await designDialog.getByRole("button", { name: "Create and open editor" }).click();
  await expect(page.getByRole("navigation", { name: "Editor navigation" })).toBeVisible();
  await expect(page.locator(".menu-bar-drawing-name")).toHaveText("Tennis courts perimeter");
});

test("keeps customer management usable on a mobile viewport", async ({ page }) => {
  test.setTimeout(60_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await bootstrapOrLoginOwner(page);

  await expect(pageHeading(page, "Customers")).toBeVisible();
  await expect(page.getByRole("button", { name: "New customer" })).toBeVisible();

  await page.getByRole("button", { name: "New customer" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Mobile Yard");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(pageHeading(page, "Mobile Yard")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add site" }).first()).toBeVisible();
});
