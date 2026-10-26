import { chromium, expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("follow changes stay in sync between a post and the account panel", async ({
  page,
}) => {
  await page.goto("/demo/");
  const post = page
    .locator("article")
    .filter({ hasText: "The most useful skill" });
  await post.getByRole("button", { name: "Following", exact: true }).click();
  await post.getByRole("button", { name: "Maya Chen", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Follow", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Following", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    post.getByRole("button", { name: "Following", exact: true }),
  ).toBeVisible();
});

test("a checked lesson keeps its feedback visible and unlocks reading", async ({
  page,
}) => {
  await page.goto("/demo/");
  await page.getByRole("button", { name: "Learn mode", exact: true }).click();
  await expect(
    page.getByText("Unlocks at Pro", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Your explanation")
    .fill(
      "A garden is a system. Water, sunlight and soil work together to help plants grow. Too much water can damage the roots instead of helping.",
    );
  await page
    .getByRole("button", { name: "Check explanation", exact: true })
    .click();
  await expect(page.getByText("82/100", { exact: true })).toBeVisible();
  await expect(page.getByText("In a live check, Grok reviews your explanation", { exact: false })).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: "Thinking in systems", exact: true })
      .last(),
  ).toBeVisible();
  await expect(page.getByText("Unlocks at Pro", { exact: false })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Next lesson", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next lesson", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Feedback loops", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Your explanation")).toHaveValue("");
});

test("profile recognition and capture make their demo status explicit", async ({
  page,
}) => {
  await page.goto("/demo/");
  await page.getByRole("button", { name: "profile", exact: true }).click();
  await expect(
    page.getByText("Recognized · X profile", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const capture = page.locator(".capture-result").first();
  await expect(capture.getByText("Following", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("No X request was made");
});

test("mobile layout has no horizontal overflow and exposes installation instructions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo/");
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  await expect(page.locator(".right-column")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toContainText("Grok · text-first learning");
  await page
    .getByRole("button", { name: "Install tenbrains on your phone" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Add to Home Screen");
  await expect(page.getByRole("dialog")).toContainText(
    "needs an internet connection",
  );
});

test("PWA manifest and icons are served and Chromium accepts installability metadata", async () => {
  // Incognito contexts cannot install apps, regardless of their metadata.
  const directory = await mkdtemp(join(tmpdir(), "tenbrains-pwa-"));
  const context = await chromium.launchPersistentContext(directory, {
    headless: true,
    ...test.info().project.use.launchOptions,
    baseURL: process.env.TEST_URL || "http://localhost:8787",
  });
  try {
    const page = context.pages()[0];
    await page.goto("/demo/");
    const session = await context.newCDPSession(page);
    const result = await session.send("Page.getAppManifest");
    expect(result.errors).toEqual([]);
    const manifest = JSON.parse(result.data!);
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    for (const icon of manifest.icons) {
      const response = await page.request.get(icon.src);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain("image/png");
    }
    const install = await session.send("Page.getInstallabilityErrors");
    expect(install.installabilityErrors).toEqual([]);
  } finally {
    await context.close();
    await rm(directory, { recursive: true, force: true });
  }
});
