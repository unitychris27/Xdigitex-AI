import OpenAI from "openai";

export type AIProvider = "deepseek" | "openrouter" | "openai" | "nvidia" | "xai";

export interface GenerateOptions {
  prompt: string;
  provider?: AIProvider;
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
}

function getDeepSeekClient() {
  const apiKey = process.env["DEEPSEEK_API_KEY"];
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");
  return new OpenAI({ baseURL: "https://api.deepseek.com/v1", apiKey });
}

function getOpenRouterClient() {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: { "HTTP-Referer": "https://xdigitex.ai", "X-Title": "XDIGITEX AI" },
  });
}

function getOpenAIClient() {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

function getNVIDIAClient() {
  const apiKey = process.env["NVIDIA_API_KEY"];
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not set — add it in the Secrets tab");
  return new OpenAI({ baseURL: "https://integrate.api.nvidia.com/v1", apiKey });
}

function getXAIClient() {
  const apiKey = process.env["XAI_API_KEY"];
  if (!apiKey) throw new Error("XAI_API_KEY is not set — add it in the Secrets tab");
  return new OpenAI({ baseURL: "https://api.x.ai/v1", apiKey });
}

export function getAIClient(provider: AIProvider = "deepseek") {
  if (provider === "openrouter") return getOpenRouterClient();
  if (provider === "openai")    return getOpenAIClient();
  if (provider === "nvidia")    return getNVIDIAClient();
  if (provider === "xai")       return getXAIClient();
  return getDeepSeekClient();
}

// ─── Auto mode model roster ──────────────────────────────────────────────────
// Role          Provider   Model
// ─────────     ─────────  ──────────────────────────────────────
// planner       nvidia     moonshotai/kimi-k2.6          (architect)
// builder       deepseek   deepseek-chat                 (code writer)
// verifier      nvidia     deepseek-ai/deepseek-v4-flash (fast checks)
// recovery      nvidia     z-ai/glm-5.1                  (debugger)
export type AgentRole = "planner" | "builder" | "verifier" | "recovery";
export function autoModel(role: AgentRole): string {
  if (role === "planner")  return "moonshotai/kimi-k2.6";
  if (role === "verifier") return "deepseek-ai/deepseek-v4-flash";
  if (role === "recovery") return "z-ai/glm-5.1";
  return "deepseek-chat"; // builder → DeepSeek direct API
}

export function autoProvider(role: AgentRole): AIProvider {
  if (role === "builder") return "deepseek"; // paid API, no rate limits
  return "nvidia";                           // planner/verifier/recovery → free NVIDIA NIM
}

// ─── Gemini vision: screenshot analysis ─────────────────────────────────────
// Uses gemini-2.0-flash (multimodal) via REST API.
// Returns structured description text; never throws — returns error string instead.
export async function analyzeScreenshotWithGemini(
  base64Jpeg: string,
  label: string,
): Promise<string> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) return `[Gemini vision unavailable — GEMINI_API_KEY not set]`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        {
          text: [
            `Analyze this screenshot labeled "${label}".`,
            "Return ONLY valid JSON (no markdown, no explanation):",
            '{"page_type":"","visible_errors":[],"missing_elements":[],"css_loaded":true,"page_blank":false,"next_action":"","confidence":0.9}',
            "",
            "Rules:",
            "- page_blank: true if you see a white/blank page, browser error, or about:blank",
            "- visible_errors: list every error message you can read verbatim",
            "- confidence: how sure you are (0.0–1.0); below 0.7 means uncertain",
          ].join("\n"),
        },
        { inline_data: { mime_type: "image/jpeg", data: base64Jpeg } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      return `[Gemini vision error ${res.status}: ${txt.slice(0, 200)}]`;
    }
    const data = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[Gemini: empty response]";
  } catch (e) {
    return `[Gemini vision exception: ${String(e).slice(0, 200)}]`;
  }
}

// ─── Gemini image generation ────────────────────────────────────────────────
export async function generateImageWithGemini(prompt: string): Promise<string> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: "16:9" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini image API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { predictions: { bytesBase64Encoded: string; mimeType: string }[] };
  const prediction = data.predictions?.[0];
  if (!prediction?.bytesBase64Encoded) throw new Error("No image returned from Gemini");

  return `data:${prediction.mimeType ?? "image/png"};base64,${prediction.bytesBase64Encoded}`;
}

export function getDefaultModel(provider: AIProvider): string {
  if (provider === "openrouter") return "deepseek/deepseek-chat";
  if (provider === "openai")     return "gpt-4o";
  if (provider === "nvidia")     return NVIDIA_MODELS.kimi;
  return "deepseek-chat";
}

export const SITE_GENERATION_SYSTEM_PROMPT = `You are an expert web developer who creates beautiful, modern, production-ready websites.`;

export const AGENT_SYSTEM_PROMPT = `You are an expert AI software architect and developer assistant working inside XDIGITEX AI — a multi-agent development platform.

You help users:
- Plan and architect software projects
- Generate, review, and refactor code
- Debug issues and explain solutions
- Design system architecture and APIs

Be concise, technical, and actionable. Use markdown for code blocks.`;
