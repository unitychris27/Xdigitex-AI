import OpenAI from "openai";

export type AIProvider = "deepseek" | "openrouter" | "openai" | "nvidia";

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

export function getAIClient(provider: AIProvider = "deepseek") {
  if (provider === "openrouter") return getOpenRouterClient();
  if (provider === "openai")    return getOpenAIClient();
  if (provider === "nvidia")    return getNVIDIAClient();
  return getDeepSeekClient();
}

// ─── NVIDIA NIM model roster ────────────────────────────────────────────────
export const NVIDIA_MODELS = {
  kimi:    "moonshotai/kimi-k2.6",        // Planner / Architect
  v4pro:   "deepseek-ai/deepseek-v4-pro", // Builder  / SSH code
  v4flash: "deepseek-ai/deepseek-v4-flash",// Verifier / log reading (fast)
  glm:     "z-ai/glm-5.1",               // Recovery / debugging
} as const;

// Role → NVIDIA model used in "auto" mode rotation
export type AgentRole = "planner" | "builder" | "verifier" | "recovery";
export function autoModel(role: AgentRole): string {
  if (role === "planner")  return NVIDIA_MODELS.kimi;
  if (role === "verifier") return NVIDIA_MODELS.v4flash;
  if (role === "recovery") return NVIDIA_MODELS.glm;
  return "deepseek-chat"; // builder → DeepSeek direct API
}

// Role → which provider/client to use
// builder uses the user's paid DeepSeek API (no rate limits)
// planner + recovery use NVIDIA NIM (Kimi, GLM)
export function autoProvider(role: AgentRole): AIProvider {
  if (role === "builder" || role === "verifier") return "deepseek";
  return "nvidia";
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
