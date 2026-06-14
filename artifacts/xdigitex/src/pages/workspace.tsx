import { useState, useRef, useEffect, useCallback } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, Sparkles, Globe, Code2, FileText, Rocket, X,
  Download, CheckCircle2, Copy, Check, File, FileCode2,
  History, Zap, BarChart3, Crown, Plus, Trash2, Upload, GitBranch, RotateCcw,
  ChevronRight, Package, Database, Cpu, Layers, CheckCheck, Terminal,
  ExternalLink, AlertCircle, Send, MessageSquare, Bot, FolderOpen, ImageIcon,
  PlusCircle,
} from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const STORAGE_KEY = "xdx_workspace_v6";

// ─── Types ────────────────────────────────────────────────────────────────────
type BuildMode = "economy" | "balanced" | "high-power";
type Tab = "files" | "preview" | "deploy" | "history" | "logs";
type GeneratedFile = { name: string; content: string; language: string };
type DeployedSite  = { id: string; name: string; url: string; publicUrl?: string; deployedAt: string };
type BuildRecord   = { id: string; prompt: string; mode: BuildMode; files: GeneratedFile[]; builtAt: string; version: number };
type ChatMsg       = {
  id: string; role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  suggestions?: string[];
  filesChanged?: string[];
  typing?: boolean;
  at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const BUILD_MODES: { id: BuildMode; label: string; desc: string; icon: React.ElementType; badge?: string }[] = [
  { id: "economy",    label: "Economy",    desc: "DeepSeek · fast & cheap",       icon: Zap },
  { id: "balanced",   label: "Balanced",   desc: "DeepSeek · quality + speed",    icon: BarChart3, badge: "Default" },
  { id: "high-power", label: "High Power", desc: "GPT-4o · best quality",         icon: Crown,     badge: "GPT-4o"  },
];

const BUILD_STEPS = [
  { icon: Cpu,       label: "Analyzing"  },
  { icon: GitBranch, label: "Planning"   },
  { icon: Database,  label: "Data layer" },
  { icon: Layers,    label: "Backend"    },
  { icon: Globe,     label: "Frontend"   },
  { icon: Package,   label: "Packaging"  },
];

const STARTERS = [
  "Build a SaaS invoicing platform with subscriptions",
  "Create a Telegram order bot for a restaurant",
  "Build a React CRM dashboard with charts",
  "Create a FastAPI backend with JWT auth and PostgreSQL",
  "Build a stunning landing page for a fintech startup",
  "Create a VPS monitoring dashboard with alerts",
];

// ─── Utils ────────────────────────────────────────────────────────────────────
function getLanguage(ext: string): string {
  const m: Record<string, string> = {
    tsx:"typescript",ts:"typescript",jsx:"javascript",js:"javascript",
    py:"python",php:"php",go:"go",dart:"dart",vue:"vue",
    yml:"yaml",yaml:"yaml",sh:"bash",html:"html",css:"css",
    md:"markdown",json:"json",txt:"text",env:"bash",toml:"toml",
    sql:"sql",rs:"rust",rb:"ruby",java:"java",kt:"kotlin",
  };
  return m[ext] ?? "text";
}

function parseFiles(raw: string): GeneratedFile[] {
  const re = /=== FILE: (.+?) ===\n([\s\S]*?)(?==== FILE:|=== SUMMARY:|$)/g;
  const files: GeneratedFile[] = [];
  let m;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1]!.trim();
    const content = m[2]!.trim().replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
    files.push({ name, content, language: getLanguage(name.split(".").pop() ?? "txt") });
  }
  if (files.length === 0) {
    let content = raw.trim();
    const fence = content.match(/```(?:\w+)?\n?([\s\S]+?)```/);
    if (fence) content = fence[1]!.trim();
    const isHtml = content.trimStart().startsWith("<!DOCTYPE") || content.trimStart().startsWith("<html");
    const name = isHtml ? "index.html" : "index.js";
    files.push({ name, content, language: getLanguage(name.split(".").pop()!) });
  }
  return files;
}

function extractSummary(raw: string): string {
  const m = raw.match(/===\s*SUMMARY:\s*===\s*\n?([\s\S]+?)(?:===|$)/i);
  if (m?.[1]?.trim()) return m[1].trim();
  return raw.replace(/===\s*FILE:\s*[^\n]+\s*===\n[\s\S]*?(?====|\s*$)/g, "")
    .replace(/```[\s\S]*?```/g, "").trim().slice(0, 400) || "Files updated.";
}

function escRx(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function buildPreviewDoc(files: GeneratedFile[]): string {
  const htmlFile = files.find(f => f.name.endsWith(".html"));
  if (!htmlFile) return "";
  let html = htmlFile.content;
  files.filter(f => f.name.endsWith(".css")).forEach(f => {
    const base = escRx(f.name.replace(/.*\//, ""));
    html = html.replace(new RegExp(`<link[^>]*href=["'][./]*(?:[^"']*/)?${base}["'][^>]*(?:/)?>`, "gi"),
      `<style>/* ${f.name} */\n${f.content}\n</style>`);
  });
  files.filter(f => f.name.endsWith(".js")).forEach(f => {
    const base = escRx(f.name.replace(/.*\//, ""));
    html = html.replace(new RegExp(`<script[^>]*src=["'][./]*(?:[^"']*/)?${base}["'][^>]*><\\/script>`, "gi"),
      `<script>/* ${f.name} */\n${f.content}\n</script>`);
  });
  return html;
}

function detectStack(files: GeneratedFile[]) {
  const exts = [...new Set(files.map(f => f.name.split(".").pop()))].filter(Boolean);
  return exts.includes("html") ? "HTML/CSS/JS"
    : exts.includes("tsx") || exts.includes("jsx") ? "React"
    : exts.includes("vue") ? "Vue"
    : exts.includes("py") ? "Python"
    : exts.includes("php") ? "PHP"
    : exts.includes("go") ? "Go"
    : exts.includes("dart") ? "Flutter"
    : exts.includes("rs") ? "Rust"
    : "Node.js";
}

function makeSuggestions(prompt: string, summary: string): string[] {
  const t = (prompt + " " + summary).toLowerCase();
  const opts: [string[], string][] = [
    [["auth","login","signup","user account"],          "Add user authentication & login"],
    [["payment","stripe","billing","checkout"],         "Integrate payment processing"],
    [["dark mode","dark theme","theme toggle"],         "Add dark mode & theme switcher"],
    [["admin","management panel","back-office"],        "Build an admin dashboard"],
    [["database","postgres","mysql","mongo","sqlite"],  "Connect to a real database"],
    [["mobile","responsive","phone"],                   "Improve mobile responsiveness"],
    [["email","smtp","notification"],                   "Add email notifications"],
    [["api","rest","endpoint","webhook"],               "Add REST API endpoints"],
    [["deploy","docker","hosting"],                     "Set up CI/CD & deployment"],
    [["analytics","chart","metric"],                    "Add analytics & reporting"],
    [["search","filter","sort"],                        "Add search & filtering"],
    [["export","pdf","csv"],                            "Add data export (PDF/CSV)"],
  ];
  return opts.filter(([kw]) => !kw.some(k => t.includes(k))).map(([,l]) => l).slice(0, 4);
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function loadWorkspace() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

const WELCOME_MSG: ChatMsg = {
  id: "welcome", role: "assistant", at: new Date().toLocaleTimeString(),
  content: "Hi! I'm your **Project AI**.\n\nDescribe what you want to build — I'll pick the right stack and generate a complete, beautiful, ready-to-run project.\n\nYou can also upload files and ask me to modify them, or generate images with Gemini.",
  suggestions: STARTERS.slice(0, 4),
};

// ─── SSE hook ────────────────────────────────────────────────────────────────
function useSSEStream() {
  const abortRef = useRef<AbortController | null>(null);
  const stream = useCallback(async (
    url: string, body: object,
    onToken: (t: string) => void,
    onDone: (full: string) => void,
    onError: (e: string) => void,
  ) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: abortRef.current.signal,
    });
    if (!res.ok || !res.body) { onError(`Server error: ${res.status}`); return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
      for (const part of parts) {
        let event = "message", data = "";
        for (const line of part.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          if (line.startsWith("data: "))  data  = line.slice(6).trim();
        }
        if (!data) continue;
        const payload = JSON.parse(data);
        if (event === "token") { full += payload; onToken(payload); }
        else if (event === "done")  onDone(full || payload);
        else if (event === "error") onError(payload);
      }
    }
  }, []);
  return { stream, cancel: () => abortRef.current?.abort() };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Workspace() {
  const saved = loadWorkspace();

  const [buildMode, setBuildMode]       = useState<BuildMode>(saved.buildMode ?? "balanced");
  const [files, setFiles]               = useState<GeneratedFile[]>(saved.files ?? []);
  const [activeFile, setActiveFile]     = useState<string>(saved.activeFile ?? "");
  const [activeTab, setActiveTab]       = useState<Tab>("files");
  const [logs, setLogs]                 = useState<string[]>(saved.logs ?? []);
  const [deployments, setDeployments]   = useState<DeployedSite[]>(saved.deployments ?? []);
  const [buildHistory, setBuildHistory] = useState<BuildRecord[]>(saved.buildHistory ?? []);
  const [messages, setMessages]         = useState<ChatMsg[]>(saved.messages ?? [WELCOME_MSG]);
  const [chatInput, setChatInput]       = useState("");
  const [generating, setGenerating]     = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [streamingRaw, setStreamingRaw] = useState("");
  const [buildStep, setBuildStep]       = useState(0);
  const [deploying, setDeploying]       = useState(false);
  const [copied, setCopied]             = useState(false);
  const [detectedStack, setDetectedStack] = useState<string>(saved.detectedStack ?? "");
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue]   = useState("");
  const [isDragging, setIsDragging]     = useState(false);
  const [mobilePanel, setMobilePanel]   = useState<"workspace" | "chat">("chat");
  const [imagePrompt, setImagePrompt]   = useState("");
  const [showImageInput, setShowImageInput] = useState(false);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const logsEndRef   = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const { stream, cancel } = useSSEStream();

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  // ─── Persist ──────────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      buildMode, files, activeFile, logs: logs.slice(-100),
      deployments, buildHistory: buildHistory.slice(0, 20),
      messages: messages.slice(-40), detectedStack,
    }));
  }, [buildMode, files, activeFile, logs, deployments, buildHistory, messages, detectedStack]);

  // ─── Build step ticker ────────────────────────────────────────────────────
  useEffect(() => {
    if (!generating) { setBuildStep(0); return; }
    const id = setInterval(() => setBuildStep(s => Math.min(s + 1, BUILD_STEPS.length - 1)), 2600);
    return () => clearInterval(id);
  }, [generating]);

  const addLog = (msg: string) =>
    setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const addMsg = (msg: Omit<ChatMsg, "id" | "at">) =>
    setMessages(prev => [...prev, { ...msg, id: uid(), at: new Date().toLocaleTimeString() }]);

  const updateLastAssistant = (patch: Partial<ChatMsg>) =>
    setMessages(prev => {
      const idx = [...prev].reverse().findIndex(m => m.role === "assistant");
      if (idx < 0) return prev;
      const ri = prev.length - 1 - idx;
      return prev.map((m, i) => i === ri ? { ...m, ...patch } : m);
    });

  // ─── New Project ──────────────────────────────────────────────────────────
  const newProject = () => {
    setFiles([]);
    setActiveFile("");
    setDetectedStack("");
    setStreamingRaw("");
    setGenerating(false);
    setMessages([{ ...WELCOME_MSG, id: uid(), at: new Date().toLocaleTimeString() }]);
    setChatInput("");
    setActiveTab("files");
    setMobilePanel("chat");
    addLog("── New project started ──");
    toast.success("New project started!");
  };

  const isUpdate = files.length > 0;

  // ─── Generate / Update ────────────────────────────────────────────────────
  const generate = async () => {
    const q = chatInput.trim();
    if (!q || generating) return;
    setChatInput("");
    if ((inputRef.current as any)) { (inputRef.current as any).style.height = "auto"; }
    addMsg({ role: "user", content: q });
    addMsg({ role: "assistant", content: "", typing: true });
    setGenerating(true);
    setStreamingRaw("");
    if (!isUpdate) { setFiles([]); setActiveFile(""); setDetectedStack(""); }
    setActiveTab("files");
    setMobilePanel("workspace");
    addLog(`${isUpdate ? "Update" : "Build"} · ${buildMode} · "${q}"`);

    await stream(
      `${BASE}/api/generate/site`,
      { prompt: q, mode: buildMode, existingFiles: isUpdate ? files : undefined },
      (token) => setStreamingRaw(s => s + token),
      (full) => {
        const parsed = parseFiles(full);
        const summary = extractSummary(full);
        if (isUpdate) {
          setFiles(prev => {
            const m = [...prev];
            parsed.forEach(p => { const i = m.findIndex(f => f.name === p.name); if (i >= 0) m[i] = p; else m.push(p); });
            return m;
          });
        } else {
          setFiles(parsed);
        }
        setStreamingRaw("");
        setGenerating(false);
        setActiveFile(prev => parsed.find(f => f.name === prev)?.name ?? parsed[0]?.name ?? "");

        const mergedFiles = isUpdate
          ? (() => { const m = [...files]; parsed.forEach(p => { const i = m.findIndex(f => f.name === p.name); if (i >= 0) m[i] = p; else m.push(p); }); return m; })()
          : parsed;

        const stack = detectStack(mergedFiles);
        setDetectedStack(stack);
        setBuildHistory(h => [{
          id: uid(), prompt: q.slice(0, 80), mode: buildMode,
          files: mergedFiles, builtAt: new Date().toLocaleString(), version: h.length + 1,
        }, ...h.slice(0, 19)]);
        addLog(`✓ ${parsed.length} file(s) ${isUpdate ? "modified" : "generated"}`);
        parsed.forEach(f => addLog(`  ✓ ${f.name}`));

        const suggestions = makeSuggestions(q, summary);
        updateLastAssistant({
          content: isUpdate
            ? `Done! Here's what I changed:\n\n${summary}`
            : `Your project is ready!\n\n${summary}\n\nSwitch to **Preview** tab to see it live.`,
          typing: false, suggestions, filesChanged: parsed.map(f => f.name),
        });
        toast.success(`${isUpdate ? "Updated" : "Built"} ${parsed.length} file(s)!`);
      },
      (err) => {
        updateLastAssistant({ content: `Something went wrong: ${err}`, typing: false });
        addLog(`✗ Error: ${err}`);
        setGenerating(false);
        setStreamingRaw("");
      },
    ).catch(err => {
      if (err?.name !== "AbortError") {
        updateLastAssistant({ content: "Build was interrupted. Try again.", typing: false });
        addLog("✗ Stream interrupted");
      }
      setGenerating(false);
      setStreamingRaw("");
    });
  };

  const handleStop = () => {
    cancel(); setGenerating(false); setStreamingRaw("");
    updateLastAssistant({ content: "Build cancelled. Enter a new prompt to try again.", typing: false });
  };

  // ─── Image generation ──────────────────────────────────────────────────────
  const generateImage = async () => {
    const q = imagePrompt.trim();
    if (!q || generatingImage) return;
    setImagePrompt("");
    setShowImageInput(false);
    addMsg({ role: "user", content: `Generate image: ${q}` });
    addMsg({ role: "assistant", content: "", typing: true });
    setGeneratingImage(true);
    setMobilePanel("chat");
    try {
      const res = await fetch(`${BASE}/api/generate/image`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const { dataUrl } = await res.json() as { dataUrl: string };
      updateLastAssistant({
        content: `Here's your generated image for: *${q}*`,
        imageUrl: dataUrl, typing: false,
      });
      toast.success("Image generated!");
    } catch (e: any) {
      updateLastAssistant({ content: `Image generation failed: ${e.message}`, typing: false });
      toast.error(`Image failed: ${e.message}`);
    } finally { setGeneratingImage(false); }
  };

  // ─── Deploy ──────────────────────────────────────────────────────────────
  const deployToServer = async () => {
    const previewDoc = buildPreviewDoc(files);
    const htmlContent = previewDoc || files.find(f => f.name.endsWith(".html"))?.content;
    if (!htmlContent) { toast.error("No HTML file to publish"); return; }
    setDeploying(true);
    addLog("Publishing to XDIGITEX Hosting…");
    try {
      const res = await fetch(`${BASE}/api/generate/deploy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: htmlContent,
          name: messages.find(m => m.role === "user")?.content.slice(0, 50) ?? "project",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { id: string; name: string; url: string; publicUrl?: string };
      const dep: DeployedSite = { ...data, deployedAt: new Date().toLocaleString() };
      setDeployments(d => [dep, ...d]);
      setActiveTab("deploy");
      addLog(`✓ Published: ${data.publicUrl ?? data.url}`);
      addMsg({ role: "assistant", content: `Your site is live!\n\n**URL:** ${data.publicUrl ?? window.location.origin + data.url}\n\nShare this link anywhere. Want me to add more features?` });
      setMobilePanel("chat");
      toast.success("Published!");
    } catch (e: any) {
      toast.error(`Publish failed: ${e.message}`);
      addLog(`✗ ${e.message}`);
    } finally { setDeploying(false); }
  };

  // ─── Downloads ────────────────────────────────────────────────────────────
  const downloadZip = async (src?: GeneratedFile[], label?: string) => {
    const target = src ?? files;
    if (!target.length) return;
    const zip = new JSZip();
    const folder = zip.folder("project")!;
    target.forEach(f => folder.file(f.name, f.content));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(label ?? "project").slice(0, 30).replace(/[^a-z0-9]/gi, "-")}.zip`;
    a.click(); URL.revokeObjectURL(a.href);
    toast.success("ZIP downloaded!");
  };

  const downloadFile = (f: GeneratedFile) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([f.content], { type: "text/plain" }));
    a.download = f.name.split("/").pop() ?? f.name;
    a.click(); URL.revokeObjectURL(a.href);
  };

  // ─── File upload ─────────────────────────────────────────────────────────
  const handleUpload = async (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...files];
    let added = 0;
    for (const file of Array.from(list)) {
      if (file.name.endsWith(".zip")) {
        try {
          const zip = await JSZip.loadAsync(file);
          for (const [path, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const name = path.replace(/^[^/]+\//, "");
            if (!name) continue;
            const content = await entry.async("text");
            const i = next.findIndex(f => f.name === name);
            const item = { name, content, language: getLanguage(name.split(".").pop() ?? "txt") };
            if (i >= 0) next[i] = item; else next.push(item);
            added++;
          }
        } catch { toast.error(`Could not read ${file.name}`); }
      } else {
        const content = await file.text();
        const i = next.findIndex(f => f.name === file.name);
        const item = { name: file.name, content, language: getLanguage(file.name.split(".").pop() ?? "txt") };
        if (i >= 0) next[i] = item; else next.push(item);
        added++;
      }
    }
    setFiles(next);
    if (!activeFile && next[0]) setActiveFile(next[0].name);
    addLog(`✓ Uploaded ${added} file(s)`);
    toast.success(`${added} file(s) added`);
    addMsg({ role: "assistant", content: `Got ${added} file(s)! What would you like me to do with them?\n• Explain the code\n• Add features\n• Refactor or improve styling\n• Add authentication or payments` });
    setMobilePanel("chat");
  };

  // ─── File management ────────────────────────────────────────────────────
  const deleteFile = (name: string) => setFiles(prev => {
    const next = prev.filter(f => f.name !== name);
    if (activeFile === name) setActiveFile(next[0]?.name ?? "");
    return next;
  });
  const renameFile = (old: string, nw: string) => {
    if (!nw.trim() || nw === old) { setRenamingFile(null); return; }
    setFiles(f => f.map(f => f.name === old ? { ...f, name: nw.trim() } : f));
    if (activeFile === old) setActiveFile(nw.trim());
    setRenamingFile(null);
  };
  const addNewFile = () => {
    const name = `file-${Date.now().toString(36)}.txt`;
    setFiles(f => [...f, { name, content: "", language: "text" }]);
    setActiveFile(name);
    setTimeout(() => { setRenamingFile(name); setRenameValue(name); }, 50);
  };
  const restoreHistory = (r: BuildRecord) => {
    setFiles(r.files); setActiveFile(r.files[0]?.name ?? "");
    setBuildMode(r.mode); setActiveTab("files");
    toast.success(`v${r.version} restored`);
  };

  const currentFile = files.find(f => f.name === activeFile);
  const previewDoc  = buildPreviewDoc(files);

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "files",   label: "Files",   icon: FolderOpen },
    { id: "preview", label: "Preview", icon: Globe      },
    { id: "deploy",  label: "Deploy",  icon: Rocket     },
    { id: "history", label: "History", icon: History    },
    { id: "logs",    label: "Logs",    icon: Terminal   },
  ];

  // ─── Shared: render a chat message ────────────────────────────────────────
  const renderMsg = (msg: ChatMsg) => (
    <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      {msg.role === "assistant" && (
        <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}
      <div className={`max-w-[85%] space-y-2 flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
        <div className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
          msg.role === "user"
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-[#242424] text-foreground rounded-tl-sm border border-[#333]"
        }`}>
          {msg.typing ? (
            <div className="flex items-center gap-1 py-0.5">
              {[0,1,2].map(i => (
                <span key={i} className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          ) : (
            <div className="whitespace-pre-wrap">
              {msg.content.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                part.startsWith("**") && part.endsWith("**")
                  ? <strong key={i}>{part.slice(2, -2)}</strong>
                  : part
              )}
            </div>
          )}
        </div>

        {/* Generated image */}
        {msg.imageUrl && (
          <div className="rounded-xl overflow-hidden border border-[#333] max-w-sm">
            <img src={msg.imageUrl} alt="Generated" className="w-full h-auto" />
            <div className="bg-[#1a1a1a] px-2 py-1 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Gemini generated</span>
              <a href={msg.imageUrl} download="generated.png" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                <Download className="w-2.5 h-2.5" /> Save
              </a>
            </div>
          </div>
        )}

        {/* Files changed */}
        {msg.filesChanged && msg.filesChanged.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {msg.filesChanged.slice(0, 6).map(f => (
              <button key={f} onClick={() => { setActiveFile(f); setActiveTab("files"); setMobilePanel("workspace"); }}
                className="text-[10px] font-mono bg-[#1e1e1e] border border-[#333] text-[#ce9178] px-1.5 py-0.5 rounded hover:border-primary/40 transition-colors">
                {f}
              </button>
            ))}
            {(msg.filesChanged.length > 6) && (
              <span className="text-[10px] text-muted-foreground/40 self-center">+{msg.filesChanged.length - 6} more</span>
            )}
          </div>
        )}

        {/* Suggestions */}
        {msg.suggestions && msg.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {msg.suggestions.map(s => (
              <button key={s} onClick={() => { setChatInput(s); inputRef.current?.focus(); }}
                className="text-[11px] border border-[#333] text-muted-foreground rounded-full px-2.5 py-1 hover:border-primary/50 hover:text-primary transition-colors bg-[#1a1a1a]">
                {s}
              </button>
            ))}
          </div>
        )}
        <span className="text-[9px] text-muted-foreground/25 px-1">{msg.at}</span>
      </div>
      {msg.role === "user" && (
        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold text-primary">U</div>
      )}
    </div>
  );

  // ─── Chat panel ───────────────────────────────────────────────────────────
  const ChatPanel = (
    <div className="h-full flex flex-col bg-[#161616]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#282828] shrink-0">
        <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">Project AI</p>
          <p className="text-[10px] text-muted-foreground">
            {generating ? "Building your project…" : generatingImage ? "Generating image…" : isUpdate ? "Ready · ask for changes" : "Ready · describe your project"}
          </p>
        </div>
        {(generating || generatingImage) && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />}
        <button onClick={newProject} title="New Project"
          className="flex items-center gap-1 text-[10px] text-muted-foreground border border-[#333] rounded-md px-2 py-1 hover:border-primary/40 hover:text-primary transition-colors shrink-0">
          <PlusCircle className="w-3 h-3" /> New
        </button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-4">
          {messages.map(renderMsg)}

          {/* Live build progress in chat */}
          {generating && streamingRaw && (
            <div className="flex gap-2 justify-start">
              <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-[#242424] border border-[#333] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[85%]">
                <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
                  {BUILD_STEPS.map((step, i) => {
                    const Icon = step.icon;
                    const done = i < buildStep, active = i === buildStep;
                    return (
                      <div key={i} className={`flex items-center gap-1 text-[10px] ${done ? "text-green-400" : active ? "text-primary" : "text-muted-foreground/20"}`}>
                        {done ? <CheckCheck className="w-2.5 h-2.5" /> : active ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Icon className="w-2.5 h-2.5" />}
                        {step.label}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">Writing {streamingRaw.length.toLocaleString()} chars…<span className="inline-block w-1.5 h-3 bg-primary/60 animate-pulse ml-0.5 align-middle" /></p>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      {/* Image prompt input (toggle) */}
      {showImageInput && (
        <div className="border-t border-[#282828] px-3 py-2 shrink-0 bg-[#1a1a1a]">
          <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
            <ImageIcon className="w-3 h-3 text-primary" /> Generate image with Gemini
          </p>
          <div className="flex gap-2">
            <input autoFocus value={imagePrompt} onChange={e => setImagePrompt(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") generateImage(); if (e.key === "Escape") setShowImageInput(false); }}
              placeholder="Describe the image (e.g. futuristic city skyline at night)"
              className="flex-1 bg-[#242424] border border-[#333] rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50" />
            <Button size="sm" onClick={generateImage} disabled={!imagePrompt.trim() || generatingImage}
              className="shrink-0 h-9 w-9 p-0">
              {generatingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </Button>
            <button onClick={() => setShowImageInput(false)} className="text-muted-foreground hover:text-foreground p-1"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}

      {/* Chat input */}
      <div className="border-t border-[#282828] p-3 shrink-0 space-y-2">
        {/* Mode selector */}
        <div className="flex gap-1">
          {BUILD_MODES.map(m => {
            const Icon = m.icon;
            const active = buildMode === m.id;
            return (
              <button key={m.id} onClick={() => setBuildMode(m.id)} disabled={generating} title={m.desc}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all flex-1 justify-center ${
                  active ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground bg-[#1e1e1e] border border-transparent"
                }`}>
                <Icon className="w-3 h-3" />
                <span>{m.label}</span>
                {m.badge && active && <span className="text-[8px] bg-primary/25 px-1 rounded hidden sm:inline">{m.badge}</span>}
              </button>
            );
          })}
        </div>

        {/* Text input + send */}
        <div className="flex gap-2 items-end">
          <textarea ref={inputRef} value={chatInput}
            onChange={e => { setChatInput(e.target.value); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 120) + "px"; }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); } }}
            placeholder={isUpdate ? "Describe a change to make…" : "What do you want to build?"}
            className="flex-1 bg-[#1e1e1e] border border-[#333] rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 resize-none min-h-[42px] max-h-[120px]"
            rows={1} disabled={generating} />
          <div className="flex flex-col gap-1.5">
            {generating ? (
              <Button size="sm" variant="outline" onClick={handleStop}
                className="rounded-xl border-red-500/40 text-red-400 hover:bg-red-500/10 h-10 w-10 p-0">
                <X className="w-4 h-4" />
              </Button>
            ) : (
              <Button size="sm" onClick={generate} disabled={!chatInput.trim()}
                className="rounded-xl h-10 w-10 p-0">
                <Send className="w-4 h-4" />
              </Button>
            )}
            <button onClick={() => setShowImageInput(v => !v)}
              title="Generate image with Gemini"
              className={`rounded-xl h-8 w-10 flex items-center justify-center border transition-colors ${showImageInput ? "border-primary/50 bg-primary/10 text-primary" : "border-[#333] text-muted-foreground hover:border-primary/30 hover:text-primary"}`}>
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Quick actions */}
        {files.length > 0 && !generating && (
          <div className="flex items-center gap-3 pt-0.5">
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              <Upload className="w-3 h-3" /> Upload
            </button>
            <span className="text-muted-foreground/20 text-xs">·</span>
            <button onClick={deployToServer} disabled={deploying}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              {deploying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />} Publish
            </button>
            <span className="text-muted-foreground/20 text-xs">·</span>
            <button onClick={() => downloadZip()}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              <Download className="w-3 h-3" /> ZIP
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Workspace panel ──────────────────────────────────────────────────────
  const WorkspacePanel = (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b bg-card/30 shrink-0 overflow-x-auto scrollbar-none">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors shrink-0 ${
              activeTab === tab.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <tab.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
        {detectedStack && !generating && (
          <div className="ml-auto flex items-center gap-1 px-3 text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
            <Code2 className="w-3 h-3" /> {detectedStack}
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">

        {/* FILES */}
        {activeTab === "files" && (
          <div className="h-full flex"
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); handleUpload(e.dataTransfer.files); }}>

            {/* File tree */}
            <div className={`w-44 sm:w-52 border-r bg-[#1e1e1e] shrink-0 flex flex-col ${isDragging ? "bg-primary/5 border-primary/30" : ""}`}>
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#2d2d2d] shrink-0">
                <span className="text-[10px] font-semibold text-[#555] uppercase tracking-widest">Explorer</span>
                <div className="flex gap-0.5">
                  <button onClick={addNewFile} title="New file" className="p-0.5 rounded hover:bg-[#3d3d3d] text-[#555] hover:text-[#ccc]"><Plus className="w-3 h-3" /></button>
                  <button onClick={() => fileInputRef.current?.click()} title="Upload" className="p-0.5 rounded hover:bg-[#3d3d3d] text-[#555] hover:text-[#ccc]"><Upload className="w-3 h-3" /></button>
                  {files.length > 0 && <button onClick={() => downloadZip()} title="ZIP" className="p-0.5 rounded hover:bg-[#3d3d3d] text-[#555] hover:text-[#ccc]"><Download className="w-3 h-3" /></button>}
                </div>
              </div>
              {isDragging ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-1 text-primary/60 text-[11px]">
                  <Upload className="w-5 h-5" /> Drop files
                </div>
              ) : (
                <ScrollArea className="flex-1">
                  {files.length === 0 && !streamingRaw ? (
                    <div className="px-3 py-8 text-[10px] text-[#444] text-center leading-relaxed">
                      No files yet.<br />Chat to build →
                    </div>
                  ) : (
                    <div className="py-1">
                      {files.map(f => {
                        const ext = f.name.split(".").pop() ?? "";
                        const FIcon = ["html","css","js","ts","tsx","jsx","vue"].includes(ext) ? FileCode2 : File;
                        return (
                          <div key={f.name} className="group relative">
                            {renamingFile === f.name ? (
                              <input autoFocus value={renameValue}
                                className="w-full px-3 py-1.5 text-xs bg-[#37373d] text-[#d4d4d4] outline-none border border-primary/40"
                                onChange={e => setRenameValue(e.target.value)}
                                onBlur={() => renameFile(f.name, renameValue)}
                                onKeyDown={e => { if (e.key === "Enter") renameFile(f.name, renameValue); if (e.key === "Escape") setRenamingFile(null); }} />
                            ) : (
                              <button onClick={() => setActiveFile(f.name)}
                                className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-left pr-14 ${activeFile === f.name ? "bg-[#37373d] text-[#d4d4d4]" : "text-[#888] hover:bg-[#2a2a2a] hover:text-[#ccc]"}`}>
                                <FIcon className="w-3 h-3 shrink-0 text-blue-400" />
                                <span className="truncate">{f.name}</span>
                              </button>
                            )}
                            {renamingFile !== f.name && (
                              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100">
                                <button onClick={() => { setRenamingFile(f.name); setRenameValue(f.name); }} className="p-0.5 rounded hover:bg-[#555] text-[#666] hover:text-[#ccc]"><Code2 className="w-2.5 h-2.5" /></button>
                                <button onClick={() => downloadFile(f)} className="p-0.5 rounded hover:bg-[#555] text-[#666] hover:text-[#ccc]"><Download className="w-2.5 h-2.5" /></button>
                                <button onClick={() => deleteFile(f.name)} className="p-0.5 rounded hover:bg-red-500/20 text-[#666] hover:text-red-400"><Trash2 className="w-2.5 h-2.5" /></button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {streamingRaw && files.length === 0 && (
                        <div className="px-3 py-2 text-xs text-[#888] flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin text-primary" /> writing…
                        </div>
                      )}
                    </div>
                  )}
                </ScrollArea>
              )}
            </div>

            {/* Editor */}
            <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden">
              {currentFile || streamingRaw ? (
                <>
                  <div className="flex items-center justify-between bg-[#2d2d2d] border-b border-[#404040] px-3 py-1.5 shrink-0">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-3.5 h-3.5 text-[#969696]" />
                      <span className="text-[#d4d4d4] text-xs truncate max-w-32 sm:max-w-none">{currentFile?.name ?? "generating…"}</span>
                      {currentFile && <span className="text-[9px] border border-[#555] text-[#888] px-1.5 rounded shrink-0">{currentFile.language}</span>}
                    </div>
                    {currentFile && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => downloadFile(currentFile)} className="text-[10px] text-[#969696] hover:text-[#d4d4d4] px-2 py-0.5 rounded hover:bg-[#404040] flex items-center gap-1">
                          <Download className="w-3 h-3" /><span className="hidden sm:inline">Save</span>
                        </button>
                        <button onClick={() => { navigator.clipboard.writeText(currentFile.content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                          className="text-[10px] text-[#969696] hover:text-[#d4d4d4] px-2 py-0.5 rounded hover:bg-[#404040] flex items-center gap-1">
                          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                          <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <ScrollArea className="flex-1">
                    {currentFile ? (
                      <textarea value={currentFile.content}
                        onChange={e => setFiles(f => f.map(f => f.name === currentFile.name ? { ...f, content: e.target.value } : f))}
                        className="w-full min-h-full p-4 font-mono text-xs text-[#d4d4d4] leading-relaxed bg-transparent resize-none outline-none"
                        spellCheck={false} />
                    ) : (
                      <pre className="p-4 font-mono text-xs text-[#d4d4d4] leading-relaxed whitespace-pre-wrap">
                        {streamingRaw.slice(0, 8000)}
                        {generating && <span className="inline-block w-2 h-4 bg-primary/80 animate-pulse ml-0.5 align-middle" />}
                      </pre>
                    )}
                  </ScrollArea>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
                  <Sparkles className="w-10 h-10 text-[#2d2d2d]" />
                  <p className="text-sm text-[#555]">Use the AI chat to describe what to build</p>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 text-xs text-[#555] border border-[#2d2d2d] rounded-lg px-4 py-2 hover:border-primary/30 hover:text-primary transition-colors">
                    <Upload className="w-3.5 h-3.5" /> Upload files or ZIP
                  </button>
                  <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                    {STARTERS.slice(0, 4).map(ex => (
                      <button key={ex} onClick={() => { setChatInput(ex); setMobilePanel("chat"); inputRef.current?.focus(); }}
                        className="text-[10px] text-[#555] border border-[#2d2d2d] rounded px-2 py-1 hover:border-primary/30 hover:text-primary transition-colors text-left">
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
          <div className="h-full flex flex-col">
            {previewDoc || files.find(f => f.name.endsWith(".html")) ? (
              <>
                <div className="flex items-center gap-2 bg-[#1e1e1e] border-b border-[#404040] px-3 py-1.5 shrink-0">
                  <Globe className="w-3.5 h-3.5 text-[#969696]" />
                  <span className="text-xs text-[#d4d4d4]">Live Preview</span>
                  {previewDoc && <span className="text-[10px] border border-green-500/30 text-green-400 px-1.5 rounded flex items-center gap-1 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />CSS+JS inlined</span>}
                  <button onClick={() => { const b = new Blob([previewDoc || files.find(f => f.name.endsWith(".html"))!.content], { type: "text/html" }); window.open(URL.createObjectURL(b), "_blank"); }}
                    className="ml-auto text-[10px] text-[#969696] hover:text-[#d4d4d4] px-2 py-0.5 rounded hover:bg-[#404040] flex items-center gap-1 shrink-0">
                    <ExternalLink className="w-3 h-3" /> Open
                  </button>
                </div>
                <iframe srcDoc={previewDoc || files.find(f => f.name.endsWith(".html"))!.content}
                  className="flex-1 border-0 bg-white" sandbox="allow-scripts allow-same-origin allow-forms" title="Preview" />
              </>
            ) : (
              <div className="h-full bg-[#1a1a1a] flex flex-col items-center justify-center gap-3 text-[#555]">
                <Globe className="w-10 h-10 text-[#2d2d2d]" />
                <p className="text-sm">{files.length > 0 ? "Preview only for HTML projects" : "Build a project to preview"}</p>
              </div>
            )}
          </div>
        )}

        {/* DEPLOY */}
        {activeTab === "deploy" && (
          <div className="h-full overflow-y-auto">
            <div className="p-4 sm:p-6 max-w-3xl space-y-5">
              {files.length > 0 && !generating && (
                <div className="border border-border/60 rounded-xl p-4 sm:p-5 bg-card/50 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold">Publish to XDIGITEX Hosting</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Get a project URL with slug based on your project name.</p>
                    </div>
                    <Button size="sm" className="gap-1.5 sm:shrink-0" onClick={deployToServer} disabled={deploying}>
                      {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                      {deploying ? "Publishing…" : "Publish Now"}
                    </Button>
                  </div>
                  {!previewDoc && <div className="flex items-start gap-2 text-[11px] text-muted-foreground/60 border-t border-border/30 pt-2"><AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /><span>Only HTML/CSS/JS projects can be published. Other stacks need a server.</span></div>}
                </div>
              )}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Deployment Targets</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { label: "XDIGITEX Hosting", desc: "One-click static hosting", ok: true },
                    { label: "Docker",            desc: "Container deployment",     ok: false },
                    { label: "Railway",           desc: "Cloud hosting",            ok: false },
                    { label: "Render",            desc: "Auto-deploy from Git",     ok: false },
                    { label: "AWS",               desc: "S3 + CloudFront CDN",      ok: false },
                    { label: "VPS / SSH",         desc: "Self-hosted server",       ok: false },
                  ].map(t => (
                    <div key={t.label} className={`border rounded-lg p-3 ${t.ok ? "border-primary/30 bg-primary/5" : "border-border/20 opacity-40"}`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-xs font-medium">{t.label}</p>
                        <span className={`text-[9px] px-1.5 rounded ${t.ok ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>{t.ok ? "Available" : "Soon"}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Published Sites</h3>
                {deployments.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground gap-2"><Rocket className="w-7 h-7 text-muted-foreground/20" /><p className="text-sm">No published sites yet</p></div>
                ) : (
                  <div className="space-y-2">
                    {deployments.map(dep => (
                      <div key={dep.id} className="border border-border/50 rounded-lg p-3 bg-card/50 space-y-2">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{dep.name}</p><p className="text-[10px] text-muted-foreground">{dep.deployedAt}</p></div>
                          <a href={dep.url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="gap-1 text-xs h-7"><Globe className="w-3 h-3" />Open</Button></a>
                        </div>
                        <div className="flex items-center gap-2 bg-muted/30 rounded px-2 py-1.5">
                          <span className="text-[11px] font-mono text-muted-foreground truncate flex-1">{dep.publicUrl ?? window.location.origin + dep.url}</span>
                          <button onClick={() => { navigator.clipboard.writeText(dep.publicUrl ?? window.location.origin + dep.url); toast.success("URL copied!"); }}><Copy className="w-3 h-3 text-muted-foreground hover:text-foreground shrink-0" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* HISTORY */}
        {activeTab === "history" && (
          <div className="h-full overflow-y-auto">
            <div className="p-4 max-w-3xl space-y-3">
              {buildHistory.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground"><History className="w-7 h-7 text-muted-foreground/20" /><p className="text-sm">No builds yet</p></div>
              ) : buildHistory.map(r => (
                <div key={r.id} className="border border-border/50 rounded-lg p-3 bg-card/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 rounded font-mono">v{r.version}</span>
                        <span className="text-[10px] bg-muted text-muted-foreground px-1.5 rounded">{r.mode}</span>
                        <span className="text-[10px] text-muted-foreground">{r.files.length} files</span>
                      </div>
                      <p className="text-sm font-medium truncate">{r.prompt}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{r.builtAt}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="text-[10px] h-7 px-2 gap-1" onClick={() => downloadZip(r.files, r.prompt)}><Download className="w-3 h-3" />ZIP</Button>
                      <Button size="sm" variant="outline" className="text-[10px] h-7 px-2 gap-1" onClick={() => restoreHistory(r)}><RotateCcw className="w-3 h-3" />Restore</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LOGS */}
        {activeTab === "logs" && (
          <div className="h-full flex flex-col bg-[#0d0d0d] font-mono">
            <div className="flex items-center justify-between bg-[#1a1a1a] border-b border-[#2a2a2a] px-3 py-1.5 shrink-0">
              <div className="flex items-center gap-2"><Terminal className="w-3.5 h-3.5 text-[#666]" /><span className="text-xs text-[#666]">Build Logs</span></div>
              {logs.length > 0 && <button onClick={() => setLogs([])} className="text-[10px] text-[#555] hover:text-[#888]">Clear</button>}
            </div>
            <ScrollArea className="flex-1 p-4">
              {logs.length === 0 ? <div className="text-[11px] text-[#444]">No logs yet.</div> : (
                <div className="space-y-0.5">
                  {logs.map((log, i) => (
                    <div key={i} className={`text-[11px] ${log.includes("✓") ? "text-green-400" : log.includes("✗") || log.includes("Error") ? "text-red-400" : log.includes("Build") || log.includes("Update") ? "text-primary" : "text-[#888]"}`}>{log}</div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Root ─────────────────────────────────────────────────────────────────
  return (
    <div className="-mx-4 -my-4 md:-mx-6 md:-my-6 h-[calc(100svh-3.5rem)] flex flex-col border-t border-border overflow-hidden">
      <input ref={fileInputRef} type="file" multiple accept="*/*" className="hidden" onChange={e => handleUpload(e.target.files)} />

      {/* ── Mobile toggle bar ───────────────────────────────────────────────── */}
      <div className="flex md:hidden items-center border-b bg-card shrink-0">
        <button onClick={() => setMobilePanel("workspace")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium border-b-2 transition-colors ${mobilePanel === "workspace" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>
          <Code2 className="w-3.5 h-3.5" /> Workspace
        </button>
        <button onClick={() => setMobilePanel("chat")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium border-b-2 transition-colors relative ${mobilePanel === "chat" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>
          <MessageSquare className="w-3.5 h-3.5" /> AI Chat
          {(generating || generatingImage) && <span className="absolute right-6 top-2.5 w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
        </button>
      </div>

      {/* ── Mobile: single panel ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden md:hidden">
        {mobilePanel === "workspace" ? WorkspacePanel : ChatPanel}
      </div>

      {/* ── Desktop: resizable split ────────────────────────────────────────── */}
      <ResizablePanelGroup direction="horizontal" className="hidden md:flex flex-1 min-h-0">
        <ResizablePanel defaultSize={58} minSize={35}>
          {WorkspacePanel}
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-[#1a1a1a] hover:bg-primary/20 transition-colors w-1" />
        <ResizablePanel defaultSize={42} minSize={28}>
          {ChatPanel}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
