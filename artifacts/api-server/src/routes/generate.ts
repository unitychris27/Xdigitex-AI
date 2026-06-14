import { Router } from "express";
import { z } from "zod";
import { getAIClient, AGENT_SYSTEM_PROMPT, type AIProvider } from "../lib/ai.js";

const router = Router();

const hostedSites = new Map<string, { html: string; name: string; createdAt: Date }>();

const MODE_MAP: Record<string, { provider: AIProvider; model: string; tokens: number }> = {
  economy:      { provider: "deepseek",   model: "deepseek-chat",                tokens: 8000  },
  balanced:     { provider: "openrouter", model: "deepseek/deepseek-chat",       tokens: 10000 },
  "high-power": { provider: "openrouter", model: "anthropic/claude-3.5-sonnet",  tokens: 14000 },
};

// ─── System prompts ───────────────────────────────────────────────────────────

const AUTO_STACK_SYSTEM_PROMPT = `You are an expert AI software architect and full-stack developer.

When given a project description:
1. Automatically determine the best technology stack (do NOT ask the user)
2. Generate a complete, production-ready project with all files
3. Output each file using EXACTLY this format:
   === FILE: relative/path/to/file.ext ===
   [complete file content]
4. Each file must be complete — no placeholders, no TODO comments
5. Include config files (package.json, requirements.txt, docker-compose.yml, etc.)
6. For HTML projects: always split into index.html + style.css + app.js (never one giant file)
7. At the very end, add a summary section:
   === SUMMARY: ===
   [2-4 sentences explaining what was built: stack chosen, key features, how to run]

Stack rules:
- "website" / "landing page" → HTML + CSS + JS (3 separate files)
- "React" / "Next.js" / "Vue" → that framework with full scaffold
- "Laravel" → PHP/Laravel with all files
- "FastAPI" / "Django" / "Flask" → Python + requirements.txt
- "Node" / "Express" / "API" → Node.js/Express + package.json
- "bot" / "Telegram" → Python + pyTelegramBotAPI
- "Go" / "Golang" → Go + go.mod + main.go
- "Flutter" / "mobile" → Flutter/Dart + pubspec.yaml
- "SaaS" / "full-stack" / unspecified → Next.js + Tailwind + backend

Never truncate code. Never use placeholders.`;

const TARGETED_EDIT_SYSTEM_PROMPT = `You are an expert AI software engineer performing targeted modifications to an existing project.

The user will provide EXISTING PROJECT FILES and a description of changes to make.

Rules:
1. Understand the full codebase context before making changes
2. Apply ONLY the minimum changes needed to satisfy the request
3. Return ONLY the files that were actually modified — do NOT return unchanged files
4. Use the exact same file format: === FILE: path/to/file.ext ===
5. Preserve all existing code, styling, and logic that was not asked to change
6. Be surgical — change one button color, not the entire stylesheet
7. At the end, always include:
   === SUMMARY: ===
   [1-3 sentences: which files changed and what specifically was modified]

If the request requires new files, include them.
If the request requires deleting logic from an existing file, return that file with the logic removed.
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

const deploySchema = z.object({
  html: z.string().min(1),
  name: z.string().optional(),
});

// ─── POST /api/generate/site — full build or targeted edit ────────────────────
router.post("/site", async (req, res) => {
  const parsed = generateSiteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
  }

  const { prompt, mode, existingFiles, systemOverride } = parsed.data;
  const config = MODE_MAP[mode] ?? MODE_MAP["balanced"]!;
  const isUpdate = existingFiles && existingFiles.length > 0;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (event: string, data: string) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const client = getAIClient(config.provider);
    const systemPrompt = systemOverride ?? (isUpdate ? TARGETED_EDIT_SYSTEM_PROMPT : AUTO_STACK_SYSTEM_PROMPT);

    const userContent = isUpdate
      ? `EXISTING PROJECT FILES:\n${existingFiles!.map(f => `=== FILE: ${f.name} ===\n${f.content}`).join("\n\n")}\n\n---\n\nREQUESTED CHANGE:\n${prompt}`
      : `Build the following project:\n\n${prompt}`;

    const stream = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent  },
      ],
      stream: true,
      max_tokens: config.tokens,
    });

    let fullContent = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) { fullContent += delta; send("token", delta); }
    }

    send("done", fullContent);
    res.end();
  } catch (err: any) {
    req.log?.error({ err }, "AI generation error");
    send("error", err?.message ?? "AI generation failed");
    res.end();
  }
});

// ─── POST /api/generate/chat — general AI assistant chat ─────────────────────
router.post("/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
  }

  const { messages, mode } = parsed.data;
  const config = MODE_MAP[mode] ?? MODE_MAP["balanced"]!;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (event: string, data: string) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

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

// ─── POST /api/generate/deploy — save HTML and return a hosted URL ────────────
router.post("/deploy", (req, res) => {
  const parsed = deploySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
  }

  const { html, name } = parsed.data;
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const siteName = name?.trim() || `site-${id}`;

  hostedSites.set(id, { html, name: siteName, createdAt: new Date() });
  res.json({ id, name: siteName, url: `/api/generate/hosted/${id}` });
});

// ─── GET /api/generate/hosted/:id — serve a deployed HTML page ───────────────
router.get("/hosted/:id", (req, res) => {
  const site = hostedSites.get(req.params["id"] ?? "");
  if (!site) {
    return res.status(404).send("<!DOCTYPE html><html><body><h1>404 — Site not found</h1></body></html>");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(site.html);
});

// ─── GET /api/generate/hosted-list — list deployed sites ────────────────────
router.get("/hosted-list", (_req, res) => {
  const sites = Array.from(hostedSites.entries()).map(([id, s]) => ({
    id, name: s.name, url: `/api/generate/hosted/${id}`, createdAt: s.createdAt,
  }));
  res.json({ sites: sites.reverse() });
});

export default router;
