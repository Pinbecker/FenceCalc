import { expect, test } from "@playwright/test";

test("covers internal production workflows across auth, admin recovery, saving, version restore, archive, and dirty-leave guards", async ({
  page
}) => {
  test.setTimeout(60_000);

  await page.goto("/");

  await page.getByLabel("Bootstrap Secret").fill("test-bootstrap-secret");
  await page.getByLabel("Company Name").fill("Acme Fencing");
  await page.getByLabel("Your Name").fill("Owner User");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("supersecure123");
  await page.getByRole("button", { name: "Create Owner" }).click();

  await expect(page.getByRole("heading", { name: "Acme Fencing" })).toBeVisible();

  const primaryNav = page.getByRole("navigation", { name: "Primary" });

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
    page.getByText("Reset password for Operations Admin. Their active sessions were revoked.", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Log Out" }).click();
  await expect(page.getByRole("heading", { name: "Log in to your workspace" })).toBeVisible();

  await page.getByLabel("Email").fill("ops@example.com");
  await page.getByLabel("Password").fill("recoverysecure123");
  await page.getByRole("button", { name: "Log In" }).click();

  await expect(page.getByText("Operations Admin | ADMIN")).toBeVisible();

  await primaryNav.getByRole("button", { name: "Editor" }).click();
  await expect(page.getByRole("heading", { name: "Drawing" })).toBeVisible();

  await page.getByLabel("Drawing Name").fill("Operations Yard");
  await page.getByRole("button", { name: "Save New" }).click();
  await expect(page.getByText('Saved new drawing "Operations Yard"')).toBeVisible();

  await page.getByLabel("Drawing Name").fill("Operations Yard v2");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText('Saved "Operations Yard v2"', { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Library" }).click({ noWaitAfter: true });

  await expect(page.getByRole("heading", { name: "Saved drawings" })).toBeVisible();
  const drawingCard = page.locator(".drawing-library-card").filter({ hasText: "Operations Yard v2" });
  await expect(drawingCard).toContainText("Active");

  await drawingCard.getByRole("button", { name: "Version History" }).click();
  const versionOneRow = drawingCard.locator(".drawing-history-row").filter({ hasText: "Version 1" });
  await versionOneRow.getByRole("button", { name: "Restore" }).click();

  const restoredCard = page.locator(".drawing-library-card").filter({ hasText: "Operations Yard" });
  await expect(restoredCard).toContainText("v3");

  await restoredCard.getByRole("button", { name: "Archive" }).click();
  await expect(page.locator(".drawing-library-card").filter({ hasText: "Operations Yard" })).toHaveCount(0);

  await page.getByRole("button", { name: "Archived" }).click();
  const archivedCard = page.locator(".drawing-library-card").filter({ hasText: "Operations Yard" });
  await expect(archivedCard).toContainText("Archived");

  await archivedCard.getByRole("button", { name: "Unarchive" }).click();
  await page.getByRole("button", { name: "Active" }).click();
  await expect(page.locator(".drawing-library-card").filter({ hasText: "Operations Yard" })).toHaveCount(1);
});
