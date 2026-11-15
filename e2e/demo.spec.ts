import { test, expect, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync } from "node:fs";

test("captions-only submission demo", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/?demo=1");
  await expect(page.getByRole("heading", { name: "Voice Trip Concierge" })).toBeVisible();
  await expect(page.getByTestId("inference-badge")).toContainText("Deterministic fallback");

  await caption(page, "Voice Trip Concierge watches the day, then waits for one tap before it changes a stop.");
  await caption(page, "No Firebase project and no xAI key. The deterministic fallback and the labeled Seattle sample still run.");

  await page.getByTestId("load-sample").click();
  await expect(page.getByTestId("proposal-card")).toBeVisible();
  await caption(page, "Autonomy watch: the art museum is closed at arrival. Approving replaces only that stop.");

  await page.getByTestId("approve-swap").click();
  await expect(page.getByText(/is now /).first()).toBeVisible();
  await caption(page, "One stop changed. The rest of Monday, and the other days, stay where they were.");

  await page.getByTestId("trip-request").fill("swap Kerry Park for a market");
  await page.getByTestId("send").click();
  await expect(page.getByText("Melrose Market").first()).toBeVisible();
  await caption(page, "A typed revision changes Kerry Park and leaves Tuesday and Wednesday alone.");

  await page.getByTestId("tab-map").click();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await caption(page, "The day's stops and the driving line sit on an OpenStreetMap basemap.");

  await page.getByTestId("tab-watch").click();
  await expect(page.getByText(/46 minutes/).first()).toBeVisible();
  await caption(page, "Rain and a 46 minute drive stay proposed. Nothing moves until the next tap.");

  await page.getByTestId("tab-status").click();
  await expect(page.getByText("Self-healing")).toBeVisible();
  await caption(page, "Self-healing records the fallback. A dead map service shows the labeled sample instead of an empty screen.");

  await page.getByTestId("tab-plan").click();
  await page.getByTestId("city-pulse").click();
  await expect(page.getByTestId("pulse-reason")).toContainText("XAI_API_KEY");
  await caption(page, "Grok city pulse is optional cited notes from xAI. It never plans the trip, and it stays off without a key.");
  await page.waitForTimeout(1200);
});

test.afterEach(async ({ page }) => {
  const video = page.video();
  await page.close();
  const source = await video?.path();
  if (!source) return;
  mkdirSync("demo", { recursive: true });
  copyFileSync(source, "demo/voice-trip-concierge.webm");
});

async function caption(page: Page, text: string) {
  await page.locator("#demo-caption").evaluate((element, value) => {
    element.textContent = value;
    (element as HTMLElement).style.display = "block";
  }, text);
  await page.waitForTimeout(3800);
}
