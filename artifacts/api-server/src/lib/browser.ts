import { chromium, type Page } from "playwright";

export type BrowserStep =
  | { type: "navigate"; url: string }
  | { type: "screenshot"; label?: string }
  | { type: "click"; selector: string; label?: string }
  | { type: "fill"; selector: string; value: string; label?: string }
  | { type: "press"; key: string }
  | { type: "wait"; ms: number }
  | { type: "text"; label?: string };

export interface BrowserStepResult {
  index: number;
  type: string;
  ok: boolean;
  error?: string;
  screenshot?: string;
  text?: string;
  label?: string;
}

export async function runBrowserSteps(
  steps: BrowserStep[],
  onResult: (r: BrowserStepResult) => void,
): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--ignore-certificate-errors",
    ],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
  });
  const page: Page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      try {
        switch (step.type) {
          case "navigate":
            await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: 25000 });
            await page.waitForTimeout(800);
            onResult({ index: i, type: step.type, ok: true });
            break;

          case "screenshot": {
            const buf = await page.screenshot({ type: "png", fullPage: false });
            onResult({
              index: i, type: step.type, ok: true,
              screenshot: buf.toString("base64"),
              label: step.label,
            });
            break;
          }

          case "click":
            await page.click(step.selector, { timeout: 12000 });
            await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
            await page.waitForTimeout(600);
            onResult({ index: i, type: step.type, ok: true, label: step.label });
            break;

          case "fill":
            await page.fill(step.selector, step.value, { timeout: 10000 });
            onResult({ index: i, type: step.type, ok: true, label: step.label });
            break;

          case "press":
            await page.keyboard.press(step.key);
            await page.waitForTimeout(500);
            onResult({ index: i, type: step.type, ok: true });
            break;

          case "wait":
            await page.waitForTimeout(Math.min(step.ms, 10000));
            onResult({ index: i, type: step.type, ok: true });
            break;

          case "text": {
            const text = await page.evaluate(() => {
              return (document.body?.innerText ?? "").slice(0, 4000);
            });
            onResult({ index: i, type: step.type, ok: true, text, label: step.label });
            break;
          }
        }
      } catch (e: unknown) {
        const err = e instanceof Error ? e.message : String(e);
        onResult({ index: i, type: step.type, ok: false, error: err });
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}
