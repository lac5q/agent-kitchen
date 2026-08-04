import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3002";
const VIEWPORTS = [375, 768, 1280] as const;

test.describe("Agents surface viewport regression", () => {
  for (const width of VIEWPORTS) {
    test(`has no document overflow or overlapping cells at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/agents`);
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
      await expect(page.locator("[data-agent-id]").first()).toBeVisible();

      const documentWidths = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      expect(documentWidths.documentScrollWidth).toBeLessThanOrEqual(documentWidths.clientWidth + 1);
      expect(documentWidths.bodyScrollWidth).toBeLessThanOrEqual(documentWidths.clientWidth + 1);

      const rows = await page.locator("[data-agent-id]").evaluateAll((elements) =>
        elements.map((row) =>
          Array.from(row.querySelectorAll<HTMLElement>("[data-agent-cell]"))
            .map((cell) => {
              const box = cell.getBoundingClientRect();
              return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
            })
            .filter((box) => box.right > box.left && box.bottom > box.top)
        )
      );

      for (const cells of rows) {
        for (let index = 0; index < cells.length; index += 1) {
          for (let otherIndex = index + 1; otherIndex < cells.length; otherIndex += 1) {
            const cell = cells[index];
            const other = cells[otherIndex];
            const intersects =
              cell.left < other.right - 0.5 &&
              cell.right > other.left + 0.5 &&
              cell.top < other.bottom - 0.5 &&
              cell.bottom > other.top + 0.5;
            expect(intersects, `cells ${index} and ${otherIndex} overlap at ${width}px`).toBe(false);
          }
        }
      }
    });
  }
});
