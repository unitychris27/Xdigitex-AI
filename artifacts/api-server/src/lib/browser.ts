import { chromium, type Page, type Browser } from "playwright";
import { execSync } from "child_process";
import { existsSync } from "fs";

// ─── Auto-install Chromium if missing (runs once on first use) ───────────────
let browserReady = false;
function ensureBrowser(): void {
  if (browserReady) return;
  // Do NOT override PLAYWRIGHT_BROWSERS_PATH — let Playwright use its default
  // so that install (browser:setup script) and launch both resolve the same path.
  try {
    const execPath = chromium.executablePath();
    if (!existsSync(execPath)) {
      console.log("[browser] Chromium not found at", execPath, "— installing...");
      execSync("npx playwright install chromium", { stdio: "inherit", timeout: 120_000 });
      console.log("[browser] Chromium installed.");
    } else {
      console.log("[browser] Chromium ready at", execPath);
    }
    browserReady = true;
  } catch (e) {
    console.error("[browser] Setup error:", e);
  }
}

// ─── Step types ───────────────────────────────────────────────────────────────
export type BrowserStep =
  | { type: "navigate";     url: string }
  | { type: "screenshot";   label?: string; quality?: number }
  | { type: "click";        selector: string; label?: string }
  | { type: "fill";         selector: string; value: string; label?: string }
  | { type: "select";       selector: string; value: string; label?: string }
  | { type: "press";        key: string }
  | { type: "wait";         ms: number }
  | { type: "wait_for";     selector: string; timeout?: number }
  | { type: "scroll";       x?: number; y?: number }
  | { type: "hover";        selector: string }
  | { type: "text";         label?: string }
  | { type: "html";         selector?: string; label?: string }
  | { type: "evaluate";     script: string; label?: string };

export interface BrowserStepResult {
  index:       number;
  type:        string;
  ok:          boolean;
  error?:      string;
  screenshot?: string;   // base64 JPEG
  text?:       string;
  label?:      string;
}

// ─── Utility: compress screenshot to JPEG to save tokens ─────────────────────
async function captureJpeg(page: Page, quality = 70): Promise<string> {
  const buf = await page.screenshot({
    type: "jpeg",
    quality,
    fullPage: false,
    clip: { x: 0, y: 0, width: 1280, height: 800 },
  });
  return buf.toString("base64");
}

// ─── Utility: smart DOM text — removes scripts/styles, collapses whitespace ──
async function extractPageText(page: Page, selector?: string): Promise<string> {
  return page.evaluate((sel) => {
    const root = sel ? document.querySelector(sel) : document.body;
    if (!root) return "";
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, style, noscript, svg, iframe").forEach(n => n.remove());
    return (clone.innerText ?? clone.textContent ?? "").replace(/\s{3,}/g, "\n\n").trim().slice(0, 6000);
  }, selector ?? null);
}

// ─── Utility: extract interactive element map for AI decision-making ──────────
async function extractInteractiveElements(page: Page): Promise<string> {
  return page.evaluate(() => {
    const els: string[] = [];
    const selectors = ["a[href]", "button", "input", "select", "textarea", "[role='button']", "[onclick]"];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el, i) => {
        const e = el as HTMLElement;
        const rect = e.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return; // skip hidden
        const label = e.getAttribute("aria-label") || e.getAttribute("placeholder") ||
                      e.getAttribute("name") || e.getAttribute("id") || e.textContent?.trim().slice(0, 40) || "";
        const type  = (e as HTMLInputElement).type || e.tagName.toLowerCase();
        const href  = (e as HTMLAnchorElement).href;
        els.push(`[${sel}] "${label}" ${href ? `href=${href}` : `type=${type}`}`);
        if (i > 30) return; // cap per selector
      });
    }
    return els.slice(0, 60).join("\n");
  });
}

// ─── Main runner ─────────────────────────────────────────────────────────────
export async function runBrowserSteps(
  steps: BrowserStep[],
  onResult: (r: BrowserStepResult) => void,
): Promise<void> {
  ensureBrowser();
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--ignore-certificate-errors",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
      ],
      executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] || undefined,
    });

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    });

    const page: Page = await context.newPage();
    page.setDefaultTimeout(20000);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      try {
        switch (step.type) {

          case "navigate":
            await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: 30000 });
            await page.waitForTimeout(1200);
            onResult({ index: i, type: step.type, ok: true });
            break;

          case "screenshot": {
            const b64 = await captureJpeg(page, step.quality ?? 72);
            onResult({ index: i, type: "screenshot", ok: true, screenshot: b64, label: step.label });
            break;
          }

          case "click": {
            // Try primary selector, then fallback to text/aria
            let clicked = false;
            try {
              await page.click(step.selector, { timeout: 10000 });
              clicked = true;
            } catch {
              // Fallback: try to find by visible text
              const textMatch = step.label ?? step.selector.replace(/[#.[]/g, "").replace(/]/g, "");
              try {
                await page.getByText(textMatch, { exact: false }).first().click({ timeout: 6000 });
                clicked = true;
              } catch { /* ignore */ }
            }
            if (!clicked) throw new Error(`Element not found: ${step.selector}`);
            await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
            await page.waitForTimeout(700);
            onResult({ index: i, type: "click", ok: true, label: step.label });
            break;
          }

          case "fill": {
            try {
              await page.fill(step.selector, step.value, { timeout: 10000 });
            } catch {
              // fallback: try by name attribute
              await page.locator(`[name="${step.selector.replace(/[#.]/g, "")}"]`)
                        .fill(step.value, { timeout: 6000 });
            }
            onResult({ index: i, type: "fill", ok: true, label: step.label });
            break;
          }

          case "select":
            await page.selectOption(step.selector, step.value, { timeout: 10000 });
            onResult({ index: i, type: "select", ok: true, label: step.label });
            break;

          case "press":
            await page.keyboard.press(step.key);
            await page.waitForTimeout(600);
            onResult({ index: i, type: "press", ok: true });
            break;

          case "wait":
            await page.waitForTimeout(Math.min(step.ms, 12000));
            onResult({ index: i, type: "wait", ok: true });
            break;

          case "wait_for":
            await page.waitForSelector(step.selector, {
              state: "visible",
              timeout: step.timeout ?? 15000,
            });
            onResult({ index: i, type: "wait_for", ok: true });
            break;

          case "scroll":
            await page.evaluate(({ x, y }) => window.scrollBy(x ?? 0, y ?? 600), {
              x: step.x ?? 0,
              y: step.y ?? 600,
            });
            await page.waitForTimeout(400);
            onResult({ index: i, type: "scroll", ok: true });
            break;

          case "hover":
            await page.hover(step.selector, { timeout: 10000 });
            await page.waitForTimeout(400);
            onResult({ index: i, type: "hover", ok: true });
            break;

          case "text": {
            const text = await extractPageText(page);
            const elements = await extractInteractiveElements(page).catch(() => "");
            const combined = `=== PAGE TEXT ===\n${text}\n\n=== INTERACTIVE ELEMENTS ===\n${elements}`;
            onResult({ index: i, type: "text", ok: true, text: combined, label: step.label });
            break;
          }

          case "html": {
            const html = await page.evaluate((sel) => {
              const el = sel ? document.querySelector(sel) : document.body;
              return el?.innerHTML?.slice(0, 5000) ?? "";
            }, step.selector ?? null);
            onResult({ index: i, type: "html", ok: true, text: html, label: step.label });
            break;
          }

          case "evaluate": {
            const result = await page.evaluate(step.script);
            onResult({ index: i, type: "evaluate", ok: true, text: String(result), label: step.label });
            break;
          }
        }
      } catch (e: unknown) {
        const err = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
        // On failure: auto-capture screenshot + text so AI can recover
        let autoShot: string | undefined;
        let autoText: string | undefined;
        try { autoShot = await captureJpeg(page, 60); } catch { /* ignore */ }
        try { autoText = await extractPageText(page); } catch { /* ignore */ }
        onResult({ index: i, type: step.type, ok: false, error: err, screenshot: autoShot, text: autoText });
      }
    }
  } finally {
    await browser?.close().catch(() => {});
  }
}
