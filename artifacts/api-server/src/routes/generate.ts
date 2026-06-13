import { Router } from "express";
import { z } from "zod";
import { getAIClient, getDefaultModel, AGENT_SYSTEM_PROMPT, type AIProvider } from "../lib/ai.js";

const router = Router();

const hostedSites = new Map<string, { html: string; name: string; createdAt: Date }>();

// Build mode → provider + model
const MODE_MAP: Record<string, { provider: AIProvider; model: string; tokens: number }> = {
  economy:    { provider: "deepseek",    model: "deepseek-chat",                    tokens: 8000  },
  balanced:   { provider: "openrouter",  model: "deepseek/deepseek-chat",           tokens: 10000 },
  "high-power": { provider: "openrouter", model: "anthropic/claude-3.5-sonnet",    tokens: 12000 },
};

const AUTO_STACK_SYSTEM_PROMPT = `You are an expert AI software architect and full-stack developer.

When given a project description, you:
1. Automatically determine the best technology stack (do NOT ask the user to choose)
2. Generate a complete, production-ready project with all necessary files
3. Format every file using EXACTLY this separator: === FILE: relative/path/to/file.ext ===
4. Each file should be complete and working — no placeholders, no TODO comments
5. Include all config files (package.json, requirements.txt, docker-compose.yml, etc.)
6. Add a README.md with setup and run instructions

Stack selection rules:
- "website" / "landing page" / "frontend only" → use HTML + CSS + JS (single index.html)
- "React" / "Next.js" / "Vue" → use that framework with full project scaffold
- "Laravel" → use PHP/Laravel with all relevant files
- "FastAPI" / "Django" / "Flask" → use Python with requirements.txt
- "Node" / "Express" / "API" (no specific frontend) → Node.js/Express with package.json
- "bot" / "Telegram" → Python with pyTelegramBotAPI
- "Go" / "Golang" → Go with go.mod and main.go
- "Flutter" / "mobile" → Flutter/Dart with pubspec.yaml
- "Docker" / "DevOps" → Docker Compose + Dockerfile(s)
- "SaaS" / "full-stack" / unspecified → Next.js + Tailwind + appropriate backend

Always output the full file content between separators. Never truncate code. Never use placeholders like [add your code here].`;

const generateSiteSchema = z.object({
  prompt: z.string().min(1).max(4000),
  mode: z.enum(["economy", "balanced", "high-power"]).default("economy"),
  // legacy fields kept for backwards compat but ignored
  provider: z.string().optional(),
  model: z.string().optional(),
  systemOverride: z.string().max(3000).optional(),
});

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).min(1),
  mode: z.enum(["economy", "balanced", "high-power"]).default("economy"),
  // legacy
  provider: z.string().optional(),
  model: z.string().optional(),
});

const deploySchema = z.object({
  html: z.string().min(1),
  name: z.string().optional(),
});

// POST /api/generate/site — streams generated project via SSE
router.post("/site", async (req, res) => {
  const parsed = generateSiteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
  }

  const { prompt, mode, systemOverride } = parsed.data;
  const config = MODE_MAP[mode] ?? MODE_MAP["economy"]!;

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
    const systemPrompt = systemOverride ?? AUTO_STACK_SYSTEM_PROMPT;

    send("status", "Analyzing requirements and selecting optimal stack...");

    const stream = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Build the following project:\n\n${prompt}` },
      ],
      stream: true,
      max_tokens: config.tokens,
    });

    let fullContent = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullContent += delta;
        send("token", delta);
      }
    }

    send("done", fullContent);
    res.end();
  } catch (err: any) {
    req.log?.error({ err }, "AI generation error");
    send("error", err?.message ?? "AI generation failed");
    res.end();
  }
});

// POST /api/generate/chat — agent chat with streaming
router.post("/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
  }

  const { messages, mode } = parsed.data;
  const config = MODE_MAP[mode] ?? MODE_MAP["economy"]!;

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
      messages: [
        { role: "system", content: AGENT_SYSTEM_PROMPT },
        ...messages,
      ],
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

// POST /api/generate/deploy — save HTML and return a hosted URL
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

// GET /api/generate/hosted/:id — serve a deployed HTML page
router.get("/hosted/:id", (req, res) => {
  const site = hostedSites.get(req.params["id"] ?? "");
  if (!site) {
    return res.status(404).send("<!DOCTYPE html><html><body><h1>404 — Site not found</h1></body></html>");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(site.html);
});

// GET /api/generate/hosted-list — list all deployed sites
router.get("/hosted-list", (_req, res) => {
  const sites = Array.from(hostedSites.entries()).map(([id, s]) => ({
    id, name: s.name, url: `/api/generate/hosted/${id}`, createdAt: s.createdAt,
  }));
  res.json({ sites: sites.reverse() });
});

export default router;
