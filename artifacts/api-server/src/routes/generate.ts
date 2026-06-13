import { Router } from "express";
import { z } from "zod";
import { getAIClient, getDefaultModel, SITE_GENERATION_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT, type AIProvider } from "../lib/ai.js";

const router = Router();

const generateSiteSchema = z.object({
  prompt: z.string().min(1).max(2000),
  provider: z.enum(["deepseek", "openrouter"]).default("deepseek"),
  model: z.string().optional(),
});

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).min(1),
  provider: z.enum(["deepseek", "openrouter"]).default("deepseek"),
  model: z.string().optional(),
  agentType: z.string().optional(),
});

// POST /api/generate/site — streams HTML back via SSE
router.post("/site", async (req, res) => {
  const parsed = generateSiteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
  }

  const { prompt, provider, model } = parsed.data;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (event: string, data: string) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const client = getAIClient(provider as AIProvider);
    const chosenModel = model ?? getDefaultModel(provider as AIProvider);

    send("status", `Generating site with ${chosenModel}...`);

    const stream = await client.chat.completions.create({
      model: chosenModel,
      messages: [
        { role: "system", content: SITE_GENERATION_SYSTEM_PROMPT },
        { role: "user", content: `Generate a complete, beautiful website for: ${prompt}` },
      ],
      stream: true,
      max_tokens: 8000,
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

  const { messages, provider, model } = parsed.data;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (event: string, data: string) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const client = getAIClient(provider as AIProvider);
    const chosenModel = model ?? getDefaultModel(provider as AIProvider);

    const stream = await client.chat.completions.create({
      model: chosenModel,
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

// GET /api/generate/providers — list available providers & their status
router.get("/providers", (_req, res) => {
  const deepseekOk = !!process.env["DEEPSEEK_API_KEY"];
  const openrouterOk = !!process.env["OPENROUTER_API_KEY"];

  res.json({
    providers: [
      {
        id: "deepseek",
        name: "DeepSeek",
        model: "deepseek-chat",
        available: deepseekOk,
        description: "DeepSeek V3 — fast and cost-efficient",
      },
      {
        id: "openrouter",
        name: "OpenRouter",
        model: "deepseek/deepseek-chat",
        available: openrouterOk,
        description: "OpenRouter — access 100+ models",
        models: [
          "deepseek/deepseek-chat",
          "anthropic/claude-3.5-sonnet",
          "openai/gpt-4o",
          "meta-llama/llama-3.3-70b-instruct",
          "google/gemini-2.0-flash-001",
        ],
      },
    ],
  });
});

export default router;
