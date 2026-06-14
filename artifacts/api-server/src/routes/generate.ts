import { Router } from "express";
import { z } from "zod";
import { getAIClient, generateImageWithGemini, AGENT_SYSTEM_PROMPT, type AIProvider } from "../lib/ai.js";

const router = Router();

const hostedSites = new Map<string, { html: string; name: string; slug: string; createdAt: Date }>();

const MODE_MAP: Record<string, { provider: AIProvider; model: string; tokens: number }> = {
  economy:      { provider: "openrouter", model: "google/gemini-2.0-flash",         tokens: 8000  },
  balanced:     { provider: "deepseek",   model: "deepseek-chat",                  tokens: 10000 },
  "high-power": { provider: "openai",     model: "gpt-4o",                          tokens: 16000 },
};

// ─── System prompts ────────────────────────────────────────────────────────────

const AUTO_STACK_SYSTEM_PROMPT = `You are an expert AI full-stack developer and UI designer who builds BEAUTIFUL, modern, production-quality projects.

═══ UNIVERSAL DESIGN RULES (apply to EVERY project) ═══
1. NEVER produce plain black/white or unstyled output — every project must look polished and professional
2. ALL styling must be SELF-CONTAINED — no references to external .css or .js files that are not included in the output
3. For HTML/PHP/any templated project: embed ALL CSS inside <style> tags and ALL JS inside <script> tags — no src= or href= links to local files
4. ALWAYS load from CDN (these are allowed):
   - Tailwind CSS: <script src="https://cdn.tailwindcss.com"></script>
   - Google Fonts: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
   - Bootstrap: <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
   - Font Awesome icons: <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" rel="stylesheet">
5. Color palette: use a real theme — dark navy (#0f172a), purple/indigo accents, OR clean white (#f8fafc) with bold accent color
6. Components: cards with shadows, gradient hero sections, hover transitions, proper typography hierarchy
7. EVERY page/route must have complete, real content — no Lorem Ipsum except as clearly labeled placeholder text
8. Buttons must have hover states, rounded corners, and clear visual purpose

═══ PHP / BACKEND RULES ═══
- EVERY .php file must include a complete <style> block with ALL CSS needed — no separate style.css reference
- Include Bootstrap CDN or Tailwind CDN in every PHP file's <head>
- Include Font Awesome for icons
- Always include a complete HTML document structure: <!DOCTYPE html>, <html>, <head>, <body>
- Database queries must use PDO with parameterized queries
- Forms must use POST with CSRF-style token validation
- Always provide a complete config.php or db.php as a separate file

═══ FILE FORMAT (mandatory) ═══
Output EVERY file using EXACTLY this format — no exceptions:
=== FILE: path/to/filename.ext ===
[COMPLETE file content — never truncate, never use "..." or "// rest of code"]

For HTML/CSS/JS: produce a SINGLE self-contained index.html with embedded <style> and <script> blocks
For PHP: each .php file is self-contained (no external local CSS/JS dependencies)
For React/Vue: include all component files + package.json + README
For Python: include all .py files + requirements.txt
For Node.js: include all .js files + package.json

At the very end, add:
=== SUMMARY: ===
[2-3 sentences: what was built, stack used, key features]

═══ STACK AUTO-SELECTION ═══
- "website" / "landing" / "portfolio" → Single self-contained index.html (Tailwind CDN + embedded CSS/JS)
- "SaaS" / "dashboard" → Single self-contained index.html with all sections, OR React with full scaffold
- "PHP" / "WordPress-style" / "ecommerce" → PHP files (each fully self-contained with embedded styles)
- "React" / "Vue" / "Next" → framework scaffold with all files
- "FastAPI" / "Flask" / "Django" → Python with requirements.txt
- "Express" / "Node" / "API" → Node.js + package.json
- "Telegram bot" → Python + pyTelegramBotAPI + requirements.txt
- "Go" → Go + go.mod
- "Flutter" → Dart + pubspec.yaml

CRITICAL: Generate COMPLETE, working code. Never truncate. Never use placeholders. Never reference files that are not included in your output.`;

const TARGETED_EDIT_SYSTEM_PROMPT = `You are an expert AI software engineer making targeted modifications to an existing project.

Rules:
1. Read all existing files carefully before making any changes
2. Return ONLY files that were actually modified — do NOT return unchanged files
3. Output format: === FILE: path/to/file.ext ===
4. Preserve all code that was NOT asked to change
5. Be surgical — if they ask to change a button color, only touch the CSS for that button
6. At the end, include:
   === SUMMARY: ===
   [1-2 sentences: what specifically changed]

If the design update is requested:
- Apply modern styling improvements using the same Tailwind/CSS system
- Maintain the existing structure unless restructuring was requested
- Add animations or transitions where appropriate

Never rewrite files that were not touched.`;

// ─── Schemas ─────────────────────────────────────────────────────────────────

const generateSiteSchema = z.object({
  prompt: z.string().min(1).max(6000),
  mode: z.enum(["economy", "balanced", "high-power"]).default("balanced"),
  existingFiles: z.array(z.object({
    name: z.string(),
    content: z.string(),
    language: z.string(),
  })).optional(),
  systemOverride: z.string().max(3000).optional(),
});

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).min(1),
  mode: z.enum(["economy", "balanced", "high-power"]).default("balanced"),
});

const imageSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

const deploySchema = z.object({
  html: z.string().min(1),
  name: z.string().optional(),
});

// ─── POST /api/generate/site ─────────────────────────────────────────────────
router.post("/site", async (req, res) => {
  const parsed = generateSiteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });

  const { prompt, mode, existingFiles, systemOverride } = parsed.data;
  const config = MODE_MAP[mode] ?? MODE_MAP["balanced"]!;
  const isUpdate = existingFiles && existingFiles.length > 0;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (event: string, data: string) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const client = getAIClient(config.provider);
    const systemPrompt = systemOverride ?? (isUpdate ? TARGETED_EDIT_SYSTEM_PROMPT : AUTO_STACK_SYSTEM_PROMPT);

    const userContent = isUpdate
      ? `EXISTING PROJECT FILES:\n${existingFiles!.map(f => `=== FILE: ${f.name} ===\n${f.content}`).join("\n\n")}\n\n---\n\nREQUESTED CHANGE:\n${prompt}`
      : `Build this project:\n\n${prompt}`;

    const stream = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
      stream: true,
      max_tokens: config.tokens,
    });

    let full = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) { full += delta; send("token", delta); }
    }
    send("done", full);
    res.end();
  } catch (err: any) {
    req.log?.error({ err }, "AI generation error");
    send("error", err?.message ?? "AI generation failed");
    res.end();
  }
});

// ─── POST /api/generate/image — Gemini image generation ──────────────────────
router.post("/image", async (req, res) => {
  const parsed = imageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });

  try {
    const dataUrl = await generateImageWithGemini(parsed.data.prompt);
    res.json({ dataUrl });
  } catch (err: any) {
    req.log?.error({ err }, "Gemini image error");
    res.status(500).json({ error: err?.message ?? "Image generation failed" });
  }
});

// ─── POST /api/generate/chat ─────────────────────────────────────────────────
router.post("/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });

  const { messages, mode } = parsed.data;
  const config = MODE_MAP[mode] ?? MODE_MAP["balanced"]!;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (event: string, data: string) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const client = getAIClient(config.provider);
    const stream = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "system", content: AGENT_SYSTEM_PROMPT }, ...messages],
      stream: true,
      max_tokens: 4000,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) send("token", delta);
    }
    send("done", "");
    res.end();
  } catch (err: any) {
    req.log?.error({ err }, "Agent chat error");
    send("error", err?.message ?? "Agent chat failed");
    res.end();
  }
});

// ─── POST /api/generate/deploy ────────────────────────────────────────────────
router.post("/deploy", (req, res) => {
  const parsed = deploySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });

  const { html, name } = parsed.data;
  const slugBase = (name ?? "project")
    .toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim()
    .replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 45) || "project";

  let slug = slugBase, counter = 1;
  while (hostedSites.has(slug)) slug = `${slugBase}-${counter++}`;

  hostedSites.set(slug, { html, name: name?.trim() || slug, slug, createdAt: new Date() });

  const proto = req.headers["x-forwarded-proto"] ?? "https";
  const host  = req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "localhost";
  const publicUrl = `${proto}://${host}/api/generate/hosted/${slug}`;

  res.json({ id: slug, name: name?.trim() || slug, url: `/api/generate/hosted/${slug}`, publicUrl });
});

// ─── GET /api/generate/hosted/:slug ─────────────────────────────────────────
router.get("/hosted/:slug", (req, res) => {
  const site = hostedSites.get(req.params["slug"] ?? "");
  if (!site) return res.status(404).send("<!DOCTYPE html><html><body><h1>404 — Not found</h1></body></html>");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(site.html);
});

export default router;
