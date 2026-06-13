import OpenAI from "openai";

export type AIProvider = "deepseek" | "openrouter";

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
    defaultHeaders: {
      "HTTP-Referer": "https://xdigitex.ai",
      "X-Title": "XDIGITEX AI",
    },
  });
}

export function getAIClient(provider: AIProvider = "deepseek") {
  return provider === "openrouter" ? getOpenRouterClient() : getDeepSeekClient();
}

export function getDefaultModel(provider: AIProvider): string {
  if (provider === "openrouter") return "deepseek/deepseek-chat";
  return "deepseek-chat";
}

export const SITE_GENERATION_SYSTEM_PROMPT = `You are an expert web developer. When asked to generate a website, produce a single complete self-contained HTML file with embedded CSS and JavaScript.

Rules:
- Output ONLY valid HTML starting with <!DOCTYPE html> — no markdown, no code fences, no explanations
- Use a modern, beautiful design with a dark or light theme as appropriate
- Include Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Make it fully responsive and visually polished
- Include realistic placeholder content relevant to the request
- Add subtle animations/transitions where appropriate
- The page should look professional enough to ship immediately`;

export const AGENT_SYSTEM_PROMPT = `You are an expert AI software architect and developer assistant working inside XDIGITEX AI — a multi-agent development platform.

You help users:
- Plan and architect software projects
- Generate, review, and refactor code
- Debug issues and explain solutions
- Design system architecture and APIs

Be concise, technical, and actionable. Use markdown for code blocks. When generating code, always explain what it does briefly.`;
