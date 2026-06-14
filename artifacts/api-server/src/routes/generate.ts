import { Router } from "express";
import { z } from "zod";
import { getAIClient, generateImageWithGemini, AGENT_SYSTEM_PROMPT, type AIProvider } from "../lib/ai.js";

const router = Router();

const hostedSites = new Map<string, { html: string; name: string; slug: string; createdAt: Date }>();

const MODE_MAP: Record<string, { provider: AIProvider; model: string; tokens: number }> = {
  economy:      { provider: "openrouter", model: "google/gemini-2.0-flash-001",    tokens: 8000  },
  balanced:     { provider: "deepseek",   model: "deepseek-chat",                  tokens: 10000 },
  "high-power": { provider: "openai",     model: "gpt-4o",                          tokens: 16000 },
};

// ─── System prompts ────────────────────────────────────────────────────────────

const AUTO_STACK_SYSTEM_PROMPT = `You are an expert AI full-stack developer and UI designer who builds BEAUTIFUL, modern, production-quality projects.

CRITICAL DESIGN REQUIREMENTS for every HTML/CSS/JS project:
- ALWAYS include Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- ALWAYS use Google Fonts: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
- NEVER use plain black/white as the main design — use a cohesive, professional color palette
- Use gradients, glassmorphism, or rich card-based layouts
- Add subtle animations and hover transitions
- The result must look like a premium SaaS product or agency website — not a school project

DESIGN EXAMPLES TO FOLLOW:
- Dark theme: deep navy/slate background (#0f172a or #1e1e2e), vibrant purple/indigo accents, white text with proper hierarchy
- Light theme: soft white (#f8fafc), clean cards with shadows (shadow-xl), primary accent color (blue, purple, or green)
- Always include: hero section with gradient, feature cards with icons, professional typography
- Buttons must have rounded corners, hover effects, and clear CTA styling

FILE FORMAT (mandatory):
Output each file using EXACTLY this format:
=== FILE: filename.ext ===
[complete file content]

For HTML projects, split into 3 files: index.html + style.css + app.js
For other stacks, include all necessary files.

At the end, always add:
=== SUMMARY: ===
[2-3 sentences: what was built, stack used, key features]

STACK SELECTION (auto-select, never ask user):
- "website" / "landing" / "portfolio" → Beautiful HTML + Tailwind CSS + JS (3 files)
- "SaaS" / "dashboard" / "app" → HTML + Tailwind or React
- "React" / "Vue" → that framework with full scaffold  
- "FastAPI" / "Flask" / "Django" → Python + requirements.txt
- "Express" / "Node" / "API" → Node.js + package.json
- "bot" / "Telegram" → Python + pyTelegramBotAPI
- "Go" → Go + go.mod
- "Flutter" → Dart + pubspec.yaml

Generate complete, real working code. Never use placeholders. Never truncate.`;

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
