import { useState, useRef, useEffect, useCallback } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BotMessageSquare, Send, Loader2, Sparkles, Globe,
  Code2, Terminal, FileCode2, Rocket, X, Download,
  CheckCircle2, Copy, Check, FolderOpen, ChevronRight,
  Play, FileText, File, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import JSZip from "jszip";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Tab = "files" | "preview" | "terminal" | "logs" | "deployments";
type ChatMsg = { role: "user" | "assistant"; content: string; streaming?: boolean };
type GeneratedFile = { name: string; content: string; language: string };
type DeployedSite = { id: string; name: string; url: string; deployedAt: string };

// ─── Stack definitions ───────────────────────────────────────────────────────
const STACKS = [
  { id: "html", label: "HTML / CSS / JS", icon: "🌐", preview: true, ext: "html", termCmds: ["Open index.html in browser", "npx live-server ."] },
  { id: "react", label: "React", icon: "⚛️", preview: false, ext: "tsx", termCmds: ["npm install", "npm run dev"] },
  { id: "nextjs", label: "Next.js", icon: "▲", preview: false, ext: "tsx", termCmds: ["npm install", "npm run dev"] },
  { id: "vue", label: "Vue", icon: "💚", preview: false, ext: "vue", termCmds: ["npm install", "npm run dev"] },
  { id: "nodejs", label: "Node.js / Express", icon: "🟢", preview: false, ext: "js", termCmds: ["npm install", "node server.js"] },
  { id: "python-fastapi", label: "Python / FastAPI", icon: "🐍", preview: false, ext: "py", termCmds: ["pip install -r requirements.txt", "uvicorn main:app --reload"] },
  { id: "django", label: "Django", icon: "🎸", preview: false, ext: "py", termCmds: ["pip install -r requirements.txt", "python manage.py migrate", "python manage.py runserver"] },
  { id: "laravel", label: "Laravel / PHP", icon: "🔴", preview: false, ext: "php", termCmds: ["composer install", "php artisan migrate", "php artisan serve"] },
  { id: "go", label: "Go", icon: "🔵", preview: false, ext: "go", termCmds: ["go mod tidy", "go run main.go"] },
  { id: "flutter", label: "Flutter / Dart", icon: "💙", preview: false, ext: "dart", termCmds: ["flutter pub get", "flutter run"] },
  { id: "docker", label: "Docker / Compose", icon: "🐳", preview: false, ext: "yml", termCmds: ["docker compose build", "docker compose up -d"] },
  { id: "telegram", label: "Telegram Bot", icon: "✈️", preview: false, ext: "py", termCmds: ["pip install pyTelegramBotAPI", "python bot.py"] },
  { id: "bash", label: "Bash Script", icon: "⚡", preview: false, ext: "sh", termCmds: ["chmod +x script.sh", "./script.sh"] },
];

const STACK_SYSTEM_PROMPTS: Record<string, string> = {
  html: `You are an expert web developer. Generate a complete, beautiful, self-contained HTML page with embedded CSS and JavaScript. Return ONLY the HTML file content (no markdown fences). Make it visually stunning with modern design.`,
  react: `You are an expert React developer. Generate a complete React application. Format your response with files like this:\n=== FILE: src/App.tsx ===\n[code]\n=== FILE: src/main.tsx ===\n[code]\nInclude all necessary files for the project.`,
  nextjs: `You are an expert Next.js developer. Generate a complete Next.js application with proper file structure. Use === FILE: [path] === format to separate files.`,
  vue: `You are an expert Vue.js developer. Generate a complete Vue application. Use === FILE: [path] === format to separate files.`,
  nodejs: `You are an expert Node.js/Express developer. Generate a complete Express API server. Use === FILE: [path] === format to separate files. Include package.json.`,
  "python-fastapi": `You are an expert Python/FastAPI developer. Generate a complete FastAPI application. Use === FILE: [path] === format. Include requirements.txt.`,
  django: `You are an expert Django developer. Generate a complete Django project. Use === FILE: [path] === format. Include requirements.txt and all necessary config.`,
  laravel: `You are an expert Laravel developer. Generate a complete Laravel application. Use === FILE: [path] === format. Include key controllers, models, routes, and migrations.`,
  go: `You are an expert Go developer. Generate a complete Go application. Use === FILE: [path] === format. Include go.mod and main.go.`,
  flutter: `You are an expert Flutter/Dart developer. Generate a complete Flutter app. Use === FILE: [path] === format. Include pubspec.yaml and main.dart.`,
  docker: `You are an expert DevOps engineer. Generate a complete Docker setup. Use === FILE: [path] === format. Include docker-compose.yml, Dockerfile(s), and any config files.`,
  telegram: `You are an expert Telegram bot developer using pyTelegramBotAPI. Generate a complete Telegram bot. Use === FILE: [path] === format. Include bot.py, requirements.txt, and .env.example.`,
  bash: `You are an expert shell script developer. Generate a complete, well-commented bash script. Return ONLY the bash script content.`,
};

function getLanguage(ext: string): string {
  const map: Record<string, string> = {
    tsx: "typescript", ts: "typescript", jsx: "javascript", js: "javascript",
    py: "python", php: "php", go: "go", dart: "dart", vue: "vue",
    yml: "yaml", yaml: "yaml", sh: "bash", html: "html", css: "css",
    md: "markdown", json: "json", txt: "text", env: "bash",
  };
  return map[ext] ?? "text";
}

// ─── File parser ─────────────────────────────────────────────────────────────
function parseFiles(raw: string, stackId: string): GeneratedFile[] {
  const stack = STACKS.find(s => s.id === stackId)!;
  const filePattern = /=== FILE: (.+?) ===\n([\s\S]*?)(?==== FILE:|$)/g;
  const files: GeneratedFile[] = [];
  let match;
  while ((match = filePattern.exec(raw)) !== null) {
    const name = match[1]!.trim();
    let content = match[2]!.trim();
    // Strip possible code fences
    content = content.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
    const ext = name.split(".").pop() ?? stack.ext;
    files.push({ name, content, language: getLanguage(ext) });
  }
  if (files.length === 0) {
    // Single file fallback
    let content = raw.trim();
    // Remove markdown fences
    const fenceMatch = content.match(/```(?:\w+)?\n?([\s\S]+?)```/);
    if (fenceMatch) content = fenceMatch[1]!.trim();
    const fileName = stackId === "html" ? "index.html"
      : stackId === "bash" ? "script.sh"
      : stackId.includes("python") || stackId === "telegram" || stackId === "django" ? "main.py"
      : stackId === "go" ? "main.go"
      : stackId === "laravel" ? "routes/web.php"
      : stackId === "docker" ? "docker-compose.yml"
      : "index." + stack.ext;
    files.push({ name: fileName, content, language: getLanguage(stack.ext) });
  }
  return files;
}

// ─── SSE stream hook ──────────────────────────────────────────────────────────
function useSSEStream() {
  const abort = useRef<AbortController | null>(null);
  const stream = useCallback(async (
    url: string, body: object,
    onToken: (t: string) => void,
    onDone: (full: string) => void,
    onError: (e: string) => void,
  ) => {
    abort.current?.abort();
    abort.current = new AbortController();
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: abort.current.signal,
    });
    if (!res.ok || !res.body) { onError(`Server error: ${res.status}`); return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", fullContent = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
      for (const part of parts) {
        const lines = part.split("\n");
        let event = "message", data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          if (line.startsWith("data: ")) data = line.slice(6).trim();
        }
        if (!data) continue;
        const payload = JSON.parse(data);
        if (event === "token") { fullContent += payload; onToken(payload); }
        else if (event === "done") onDone(fullContent || payload);
        else if (event === "error") onError(payload);
      }
    }
  }, []);
  const cancel = () => abort.current?.abort();
  return { stream, cancel };
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Workspace() {
  const [stackId, setStackId] = useState("html");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [rawOutput, setRawOutput] = useState("");
  const [streamingRaw, setStreamingRaw] = useState("");
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [activeFile, setActiveFile] = useState<string>("");
  const [activeTab, setActiveTab] = useState<Tab>("files");
  const [logs, setLogs] = useState<string[]>([]);
  const [deployments, setDeployments] = useState<DeployedSite[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [copied, setCopied] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Hi! I'm your AI development assistant.\n\nDescribe what you want to build — I'll generate the full project code for you. You can also ask me questions, review code, or request changes." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { stream, cancel } = useSSEStream();
  const stack = STACKS.find(s => s.id === stackId)!;

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const addLog = (msg: string) => setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setStreamingRaw("");
    setRawOutput("");
    setFiles([]);
    setActiveFile("");
    setActiveTab("files");
    addLog(`Starting generation — stack: ${stack.label}`);
    addLog(`Prompt: ${prompt}`);

    const systemPrompt = STACK_SYSTEM_PROMPTS[stackId] ?? STACK_SYSTEM_PROMPTS["html"]!;

    await stream(
      `${BASE}/api/generate/site`,
      { prompt: `[Stack: ${stack.label}]\n${prompt}`, systemOverride: systemPrompt },
      (token) => setStreamingRaw(s => s + token),
      (full) => {
        const parsed = parseFiles(full, stackId);
        setFiles(parsed);
        setRawOutput(full);
        setStreamingRaw("");
        setActiveFile(parsed[0]?.name ?? "");
        setGenerating(false);
        addLog(`Generation complete — ${parsed.length} file(s) generated`);
        parsed.forEach(f => addLog(`  ✓ ${f.name} (${f.content.length} chars)`));
        toast.success(`Generated ${parsed.length} file(s)!`);
      },
      (err) => {
        toast.error(`Generation failed: ${err}`);
        addLog(`✗ Error: ${err}`);
        setGenerating(false);
        setStreamingRaw("");
      },
    ).catch(err => {
      if (err?.name !== "AbortError") { toast.error("Stream interrupted"); addLog("✗ Stream interrupted"); }
      setGenerating(false);
    });
  };

  const deployToServer = async () => {
    const htmlFile = files.find(f => f.name.endsWith(".html")) ?? files[0];
    if (!htmlFile) return;
    setDeploying(true);
    addLog("Deploying to server...");
    try {
      const res = await fetch(`${BASE}/api/generate/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: htmlFile.content, name: prompt.slice(0, 40) }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { id: string; name: string; url: string };
      const dep: DeployedSite = { ...data, deployedAt: new Date().toLocaleTimeString() };
      setDeployments(d => [dep, ...d]);
      setActiveTab("deployments");
      addLog(`✓ Deployed: ${data.url}`);
      toast.success("Deployed successfully!");
    } catch (e: any) {
      toast.error(`Deploy failed: ${e.message}`);
      addLog(`✗ Deploy error: ${e.message}`);
    } finally {
      setDeploying(false);
    }
  };

  const downloadZip = async () => {
    if (files.length === 0) return;
    const zip = new JSZip();
    const folder = zip.folder("project")!;
    files.forEach(f => folder.file(f.name, f.content));
    folder.file("README.md", `# Project\n\nStack: ${stack.label}\nPrompt: ${prompt}\nGenerated: ${new Date().toISOString()}\n\n## Run\n\n${stack.termCmds.map(c => `\`${c}\``).join("\n")}`);
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${prompt.slice(0, 30).replace(/[^a-z0-9]/gi, "-").toLowerCase() || "project"}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("ZIP downloaded!");
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");
    const newMsgs: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages([...newMsgs, { role: "assistant", content: "", streaming: true }]);
    setChatLoading(true);
    let acc = "";
    await stream(
      `${BASE}/api/generate/chat`,
      { messages: newMsgs.map(m => ({ role: m.role, content: m.content })) },
      (token) => { acc += token; setMessages(msgs => msgs.map((m, i) => i === msgs.length - 1 ? { ...m, content: acc } : m)); },
      () => { setMessages(msgs => msgs.map((m, i) => i === msgs.length - 1 ? { ...m, streaming: false } : m)); setChatLoading(false); },
      (err) => { toast.error(`Error: ${err}`); setMessages(msgs => msgs.map((m, i) => i === msgs.length - 1 ? { ...m, content: `Error: ${err}`, streaming: false } : m)); setChatLoading(false); },
    ).catch(err => { if (err?.name !== "AbortError") toast.error("Chat interrupted"); setChatLoading(false); });
  };

  const currentFile = files.find(f => f.name === activeFile);
  const previewHtml = files.find(f => f.name.endsWith(".html"))?.content ?? "";
  const displayCode = (currentFile?.content ?? streamingRaw ?? "").slice(0, 5000);
  const hasFiles = files.length > 0 || !!streamingRaw;

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "files", label: "Files", icon: FolderOpen },
    { id: "preview", label: "Preview", icon: Globe },
    { id: "terminal", label: "Terminal", icon: Terminal },
    { id: "logs", label: "Logs", icon: FileText },
    { id: "deployments", label: "Deployments", icon: Rocket },
  ];

  return (
    <div className="h-[calc(100vh-8rem)] -m-6 flex flex-col border-t border-border">
      {/* Top bar: stack + prompt */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-card shrink-0">
        {/* Stack selector */}
        <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-md px-2.5 py-1.5 shrink-0">
          <span className="text-base leading-none">{stack.icon}</span>
          <select
            value={stackId}
            onChange={e => setStackId(e.target.value)}
            disabled={generating}
            className="bg-transparent text-xs font-medium outline-none cursor-pointer max-w-[140px]"
          >
            {STACKS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        {/* Prompt input */}
        <input
          className="flex-1 bg-muted/40 border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
          placeholder={`Describe what to build with ${stack.label}…`}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && generate()}
          disabled={generating}
        />

        <div className="flex items-center gap-1.5 shrink-0">
          {generating ? (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs text-red-400 border-red-500/30" onClick={cancel}>
              <X className="w-3 h-3" /> Stop
            </Button>
          ) : (
            <Button onClick={generate} disabled={!prompt.trim()} size="sm" className="gap-1.5">
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Generate
            </Button>
          )}
          {hasFiles && !generating && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={deployToServer} disabled={deploying}>
                {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                Deploy
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground" onClick={downloadZip}>
                <Download className="w-3.5 h-3.5" /> ZIP
              </Button>
            </>
          )}
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1 rounded-none bg-background">
        {/* Left: Tabbed workspace */}
        <ResizablePanel defaultSize={62} minSize={35}>
          <div className="h-full flex flex-col">
            {/* Tab bar */}
            <div className="flex items-center border-b bg-card/30 shrink-0">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {tab.id === "deployments" && deployments.length > 0 && (
                    <span className="ml-0.5 bg-primary/20 text-primary text-[10px] rounded-full px-1.5 py-0">{deployments.length}</span>
                  )}
                  {tab.id === "logs" && logs.length > 0 && (
                    <span className="ml-0.5 bg-muted text-muted-foreground text-[10px] rounded-full px-1.5 py-0">{logs.length}</span>
                  )}
                </button>
              ))}
              <div className="flex-1" />
              {generating && (
                <div className="flex items-center gap-1.5 px-3 text-[11px] text-primary">
                  <Loader2 className="w-3 h-3 animate-spin" /> Generating…
                </div>
              )}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">

              {/* FILES */}
              {activeTab === "files" && (
                <div className="h-full flex">
                  {/* File tree */}
                  <div className="w-44 border-r bg-[#1e1e1e] shrink-0 overflow-y-auto">
                    <div className="px-2 py-2 text-[10px] font-semibold text-[#666] uppercase tracking-widest border-b border-[#2d2d2d]">
                      Explorer
                    </div>
                    {files.length === 0 && !streamingRaw ? (
                      <div className="px-3 py-4 text-[11px] text-[#555] text-center">
                        No files yet.<br />Generate a project above.
                      </div>
                    ) : (
                      <div className="py-1">
                        {files.map(f => {
                          const ext = f.name.split(".").pop() ?? "";
                          const FIcon = ["html", "css", "js", "ts", "tsx", "jsx"].includes(ext) ? FileCode2 : File;
                          return (
                            <button
                              key={f.name}
                              onClick={() => setActiveFile(f.name)}
                              className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-left transition-colors ${
                                activeFile === f.name ? "bg-[#37373d] text-[#d4d4d4]" : "text-[#888] hover:bg-[#2a2a2a] hover:text-[#ccc]"
                              }`}
                            >
                              <FIcon className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                              <span className="truncate">{f.name}</span>
                            </button>
                          );
                        })}
                        {streamingRaw && files.length === 0 && (
                          <div className="px-3 py-1.5 text-xs text-[#888] flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin text-primary" /> writing…
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Code editor */}
                  <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden">
                    {currentFile || streamingRaw ? (
                      <>
                        <div className="flex items-center justify-between bg-[#2d2d2d] border-b border-[#404040] px-3 py-1.5 shrink-0">
                          <div className="flex items-center gap-2">
                            <Code2 className="w-3.5 h-3.5 text-[#969696]" />
                            <span className="text-[#d4d4d4] text-xs">{currentFile?.name ?? "generating…"}</span>
                            {currentFile && <Badge variant="outline" className="text-[9px] border-[#555] text-[#888] px-1">{currentFile.language}</Badge>}
                          </div>
                          {currentFile && (
                            <button
                              onClick={() => { navigator.clipboard.writeText(currentFile.content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                              className="flex items-center gap-1 text-[10px] text-[#969696] hover:text-[#d4d4d4] px-2 py-0.5 rounded hover:bg-[#404040]"
                            >
                              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                              {copied ? "Copied" : "Copy"}
                            </button>
                          )}
                        </div>
                        <ScrollArea className="flex-1">
                          <pre className="p-4 font-mono text-xs text-[#d4d4d4] leading-relaxed whitespace-pre-wrap">
                            {displayCode || (streamingRaw.slice(0, 5000))}
                            {generating && <span className="inline-block w-2 h-4 bg-primary/80 animate-pulse ml-0.5 align-middle" />}
                          </pre>
                        </ScrollArea>
                      </>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center gap-4 text-[#555]">
                        <Code2 className="w-12 h-12 text-[#333]" />
                        <div className="text-center">
                          <p className="text-sm mb-1">No project generated yet</p>
                          <p className="text-xs text-[#444]">Select a stack, describe your project, and click Generate</p>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center max-w-sm mt-2">
                          {["Build a CRM SaaS", "Create a REST API", "Telegram order bot", "Landing page with auth"].map(ex => (
                            <button key={ex} onClick={() => setPrompt(ex)} className="text-[11px] text-[#666] border border-[#333] rounded px-2 py-1 hover:border-primary/50 hover:text-primary transition-colors">
                              {ex}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PREVIEW */}
              {activeTab === "preview" && (
                <div className="h-full flex flex-col bg-white">
                  {previewHtml ? (
                    <>
                      <div className="flex items-center gap-2 bg-[#1e1e1e] border-b border-[#404040] px-3 py-1.5 shrink-0">
                        <Globe className="w-3.5 h-3.5 text-[#969696]" />
                        <span className="text-xs text-[#d4d4d4]">Live Preview</span>
                        <button onClick={() => { const b = new Blob([previewHtml], { type: "text/html" }); window.open(URL.createObjectURL(b), "_blank"); }} className="ml-auto text-[10px] text-[#969696] hover:text-[#d4d4d4] px-2 py-0.5 rounded hover:bg-[#404040] flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" /> Open full tab
                        </button>
                      </div>
                      <iframe srcDoc={previewHtml} className="flex-1 border-0" sandbox="allow-scripts allow-same-origin" title="Preview" />
                    </>
                  ) : (
                    <div className="h-full bg-[#1a1a1a] flex flex-col items-center justify-center gap-3 text-[#555]">
                      <Globe className="w-10 h-10 text-[#333]" />
                      <p className="text-sm">
                        {stack.preview
                          ? hasFiles ? "No HTML file in output" : "Generate a project to see preview"
                          : `Live preview is not available for ${stack.label} projects`}
                      </p>
                      {!stack.preview && <p className="text-xs text-[#444]">Use the Terminal tab to run the project locally</p>}
                    </div>
                  )}
                </div>
              )}

              {/* TERMINAL */}
              {activeTab === "terminal" && (
                <div className="h-full flex flex-col bg-[#0d0d0d] font-mono text-sm">
                  <div className="flex items-center gap-2 bg-[#1a1a1a] border-b border-[#2a2a2a] px-3 py-1.5 shrink-0">
                    <Terminal className="w-3.5 h-3.5 text-[#666]" />
                    <span className="text-xs text-[#666]">Terminal — {stack.label}</span>
                  </div>
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-1 text-xs">
                      <div className="text-green-400">$ # XDIGITEX AI — {stack.label} project</div>
                      {hasFiles && <>
                        <div className="text-[#666] mt-2"># Run these commands in your project directory:</div>
                        {stack.termCmds.map((cmd, i) => (
                          <div key={i} className="flex items-center gap-2 mt-1">
                            <span className="text-green-400">$</span>
                            <span className="text-[#d4d4d4]">{cmd}</span>
                            <button
                              onClick={() => { navigator.clipboard.writeText(cmd); toast.success("Copied!"); }}
                              className="ml-auto text-[#444] hover:text-[#888] opacity-0 group-hover:opacity-100"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <div className="mt-4 text-[#444] text-[11px]">
                          Download the ZIP or deploy to run your project.
                        </div>
                      </>}
                      {!hasFiles && (
                        <div className="mt-2 text-[#444]">Generate a project first to see run commands.</div>
                      )}
                      <div className="mt-4 flex items-center gap-1 text-green-400">
                        <span>$</span>
                        <span className="w-2 h-3.5 bg-green-400 animate-pulse inline-block ml-0.5" />
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* LOGS */}
              {activeTab === "logs" && (
                <div className="h-full flex flex-col bg-[#0d0d0d] font-mono">
                  <div className="flex items-center justify-between bg-[#1a1a1a] border-b border-[#2a2a2a] px-3 py-1.5 shrink-0">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-[#666]" />
                      <span className="text-xs text-[#666]">Build & Generation Logs</span>
                    </div>
                    {logs.length > 0 && <button onClick={() => setLogs([])} className="text-[10px] text-[#555] hover:text-[#888]">Clear</button>}
                  </div>
                  <ScrollArea className="flex-1 p-4">
                    {logs.length === 0 ? (
                      <div className="text-[11px] text-[#444]">No logs yet. Generate a project to see logs here.</div>
                    ) : (
                      <div className="space-y-0.5">
                        {logs.map((log, i) => (
                          <div key={i} className={`text-[11px] ${log.includes("✓") ? "text-green-400" : log.includes("✗") ? "text-red-400" : "text-[#888]"}`}>
                            {log}
                          </div>
                        ))}
                        <div ref={logsEndRef} />
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}

              {/* DEPLOYMENTS */}
              {activeTab === "deployments" && (
                <div className="h-full flex flex-col bg-background overflow-y-auto">
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Deployed Sites</span>
                      {hasFiles && !generating && (
                        <Button size="sm" className="gap-1.5 text-xs" onClick={deployToServer} disabled={deploying}>
                          {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                          Deploy Current Build
                        </Button>
                      )}
                    </div>
                    {deployments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                        <Rocket className="w-10 h-10 text-muted-foreground/30" />
                        <p className="text-sm">No deployments yet</p>
                        <p className="text-xs text-muted-foreground/50">Generate a project and click Deploy</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {deployments.map(dep => (
                          <div key={dep.id} className="border border-border/50 rounded-lg p-4 bg-card/50 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 shrink-0">
                              <CheckCircle2 className="w-4 h-4 text-green-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{dep.name}</div>
                              <div className="text-xs text-muted-foreground">Deployed at {dep.deployedAt}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <a href={dep.url} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" variant="outline" className="gap-1 text-xs">
                                  <Globe className="w-3 h-3" /> Open
                                </Button>
                              </a>
                              <button onClick={() => { navigator.clipboard.writeText(window.location.origin + dep.url); toast.success("URL copied"); }}>
                                <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle className="w-1 hover:bg-primary/50 transition-colors" />

        {/* Right: AI Chat */}
        <ResizablePanel defaultSize={38} minSize={25} className="border-l bg-card/30 flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-card shrink-0">
            <BotMessageSquare className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Agent</span>
            <Badge variant="outline" className="ml-auto text-[10px] gap-1 text-green-400 border-green-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live
            </Badge>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                    {msg.role === "assistant" ? <><BotMessageSquare className="w-3 h-3 text-primary" /> AI Agent</> : "You"}
                  </div>
                  <div className={`max-w-[88%] p-3 rounded-lg text-sm border ${
                    msg.role === "user"
                      ? "bg-primary/15 border-primary/20 text-foreground"
                      : "bg-muted/40 border-border/50 text-foreground"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed [&_pre]:bg-[#1e1e1e] [&_pre]:p-3 [&_pre]:rounded [&_code]:text-[#ce9178] [&_code]:text-xs">
                        <ReactMarkdown>{msg.content || (msg.streaming ? " " : "")}</ReactMarkdown>
                        {msg.streaming && <span className="inline-block w-1.5 h-3.5 bg-primary/80 animate-pulse ml-0.5 align-middle" />}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>

          {/* Quick prompts */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 flex flex-col gap-1.5">
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Quick start</p>
              {[
                "Build a CRM SaaS dashboard",
                "Create a Telegram order bot",
                "Build a FastAPI backend",
                "Create a Next.js e-commerce site",
              ].map(ex => (
                <button
                  key={ex}
                  onClick={() => { setPrompt(ex); setChatInput(""); }}
                  className="text-left text-xs text-muted-foreground border border-border/40 rounded-md px-3 py-1.5 hover:bg-muted/40 hover:text-foreground transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

          <div className="p-3 border-t bg-card shrink-0">
            <div className="flex gap-2">
              <textarea
                rows={2}
                placeholder="Ask anything or describe what to build…"
                className="flex-1 bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-muted-foreground/50"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                disabled={chatLoading}
              />
              <Button
                size="icon"
                onClick={chatLoading ? cancel : sendChat}
                disabled={!chatLoading && !chatInput.trim()}
                className={chatLoading ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30" : ""}
              >
                {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 mt-1.5">Enter to send · Shift+Enter for new line</p>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
