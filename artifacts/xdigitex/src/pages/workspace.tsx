import { useState, useRef, useEffect, useCallback } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BotMessageSquare, Send, Loader2, Sparkles, Globe, Code2, FileText, Rocket, X,
  Download, CheckCircle2, Copy, Check, FolderOpen, File, FileCode2, RefreshCw,
  History, Zap, BarChart3, Crown, Plus, Trash2, Upload, GitBranch, RotateCcw,
  ChevronRight, AlertCircle, Package, Database, Cpu, Layers, CheckCheck,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import JSZip from "jszip";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const STORAGE_KEY = "xdx_workspace_v3";

// ─── Types ────────────────────────────────────────────────────────────────────
type BuildMode = "economy" | "balanced" | "high-power";
type Tab = "files" | "preview" | "deploy" | "logs" | "history";
type ChatMsg = { role: "user" | "assistant"; content: string; streaming?: boolean };
type GeneratedFile = { name: string; content: string; language: string };
type DeployedSite = { id: string; name: string; url: string; deployedAt: string };
type BuildRecord = {
  id: string; prompt: string; mode: BuildMode;
  files: GeneratedFile[]; builtAt: string; version: number;
};

// ─── Build modes ──────────────────────────────────────────────────────────────
const BUILD_MODES: { id: BuildMode; label: string; description: string; icon: React.ElementType; badge?: string }[] = [
  { id: "economy",    label: "Economy",    description: "Fast & cost-efficient (DeepSeek)",        icon: Zap        },
  { id: "balanced",   label: "Balanced",   description: "Quality + speed (DeepSeek via OR)",       icon: BarChart3, badge: "Default" },
  { id: "high-power", label: "High Power", description: "Max reasoning · Claude 3.5 Sonnet",       icon: Crown,     badge: "Premium" },
];

// ─── Build steps shown during generation ──────────────────────────────────────
const BUILD_STEPS = [
  { icon: Cpu,      label: "Analyzing requirements"    },
  { icon: GitBranch, label: "Planning architecture"    },
  { icon: Database, label: "Designing data models"     },
  { icon: Layers,   label: "Generating backend"        },
  { icon: Globe,    label: "Building frontend"         },
  { icon: Package,  label: "Packaging project files"   },
];

// ─── Language helper ──────────────────────────────────────────────────────────
function getLanguage(ext: string): string {
  const map: Record<string, string> = {
    tsx: "typescript", ts: "typescript", jsx: "javascript", js: "javascript",
    py: "python", php: "php", go: "go", dart: "dart", vue: "vue",
    yml: "yaml", yaml: "yaml", sh: "bash", html: "html", css: "css",
    md: "markdown", json: "json", txt: "text", env: "bash", toml: "toml",
    sql: "sql", rs: "rust", rb: "ruby", java: "java", kt: "kotlin",
  };
  return map[ext] ?? "text";
}

// ─── File parser ──────────────────────────────────────────────────────────────
function parseFiles(raw: string): GeneratedFile[] {
  const filePattern = /=== FILE: (.+?) ===\n([\s\S]*?)(?==== FILE:|$)/g;
  const files: GeneratedFile[] = [];
  let match;
  while ((match = filePattern.exec(raw)) !== null) {
    const name = match[1]!.trim();
    let content = match[2]!.trim();
    content = content.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
    const ext = name.split(".").pop() ?? "txt";
    files.push({ name, content, language: getLanguage(ext) });
  }
  if (files.length === 0) {
    let content = raw.trim();
    const fenceMatch = content.match(/```(?:\w+)?\n?([\s\S]+?)```/);
    if (fenceMatch) content = fenceMatch[1]!.trim();
    const isHtml = content.trimStart().startsWith("<!DOCTYPE") || content.trimStart().startsWith("<html");
    const isPy = /^(import|from|def |class |#!\/usr\/bin\/env python)/.test(content.trimStart());
    const isGo = content.trimStart().startsWith("package ");
    const isSh = content.trimStart().startsWith("#!");
    const fileName = isHtml ? "index.html" : isPy ? "main.py" : isGo ? "main.go" : isSh ? "script.sh" : "index.js";
    const ext = fileName.split(".").pop() ?? "txt";
    files.push({ name: fileName, content, language: getLanguage(ext) });
  }
  return files;
}

// ─── Preview bundler — inlines CSS and JS into the HTML doc ──────────────────
function escRx(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function buildPreviewDoc(files: GeneratedFile[]): string {
  const htmlFile = files.find(f => f.name.endsWith(".html"));
  if (!htmlFile) return "";
  let html = htmlFile.content;

  files.filter(f => f.name.endsWith(".css")).forEach(f => {
    const base = escRx(f.name.replace(/.*\//, ""));
    html = html.replace(
      new RegExp(`<link[^>]*href=["'][./]*(?:[^"']*/)?${base}["'][^>]*(?:/)?>`, "gi"),
      `<style>/* ${f.name} */\n${f.content}\n</style>`,
    );
  });

  files.filter(f => f.name.endsWith(".js")).forEach(f => {
    const base = escRx(f.name.replace(/.*\//, ""));
    html = html.replace(
      new RegExp(`<script[^>]*src=["'][./]*(?:[^"']*/)?${base}["'][^>]*><\\/script>`, "gi"),
      `<script>/* ${f.name} */\n${f.content}\n</script>`,
    );
  });

  return html;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────
function loadWorkspace() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
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
  const saved = loadWorkspace();

  const [buildMode, setBuildMode] = useState<BuildMode>(saved.buildMode ?? "balanced");
  const [prompt, setPrompt] = useState(saved.prompt ?? "");
  const [generating, setGenerating] = useState(false);
  const [streamingRaw, setStreamingRaw] = useState("");
  const [buildStep, setBuildStep] = useState(0);
  const [files, setFiles] = useState<GeneratedFile[]>(saved.files ?? []);
  const [activeFile, setActiveFile] = useState<string>(saved.activeFile ?? "");
  const [activeTab, setActiveTab] = useState<Tab>("files");
  const [logs, setLogs] = useState<string[]>(saved.logs ?? []);
  const [deployments, setDeployments] = useState<DeployedSite[]>(saved.deployments ?? []);
  const [buildHistory, setBuildHistory] = useState<BuildRecord[]>(saved.buildHistory ?? []);
  const [deploying, setDeploying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [detectedStack, setDetectedStack] = useState<string>(saved.detectedStack ?? "");
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>(saved.messages ?? [
    { role: "assistant", content: "Hi! I'm your AI development assistant.\n\nDescribe what you want to build — I'll analyze your requirements, choose the right stack, and generate the complete project for you.\n\nYou can also **upload existing files**, request code changes, or ask architecture questions." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { stream, cancel } = useSSEStream();

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  // ─── Persist to localStorage ────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      buildMode, prompt, files, activeFile, logs: logs.slice(-100),
      deployments, buildHistory: buildHistory.slice(0, 20),
      messages: messages.slice(-60), detectedStack,
    }));
  }, [buildMode, prompt, files, activeFile, logs, deployments, buildHistory, messages, detectedStack]);

  // ─── Build step animation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!generating) { setBuildStep(0); return; }
    const id = setInterval(() => setBuildStep(s => Math.min(s + 1, BUILD_STEPS.length - 1)), 2800);
    return () => clearInterval(id);
  }, [generating]);

  const addLog = (msg: string) =>
    setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  // ─── Stack detector ──────────────────────────────────────────────────────────
  function detectStack(parsedFiles: GeneratedFile[]) {
    const exts = [...new Set(parsedFiles.map(f => f.name.split(".").pop()))].filter(Boolean);
    return exts.includes("html") ? "HTML/CSS/JS"
      : exts.includes("tsx") || exts.includes("jsx") ? "React"
      : exts.includes("vue") ? "Vue"
      : exts.includes("py") ? "Python"
      : exts.includes("php") ? "Laravel/PHP"
      : exts.includes("go") ? "Go"
      : exts.includes("dart") ? "Flutter"
      : exts.includes("rs") ? "Rust"
      : exts.includes("sh") ? "Bash"
      : "Node.js";
  }

  // ─── Generate / Update ────────────────────────────────────────────────────────
  const isUpdate = files.length > 0;

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setStreamingRaw("");
    if (!isUpdate) { setFiles([]); setActiveFile(""); setDetectedStack(""); }
    setActiveTab("files");
    addLog(isUpdate ? `Update started · mode: ${buildMode}` : `Build started · mode: ${buildMode}`);
    addLog(`Prompt: "${prompt}"`);
    addLog(isUpdate
      ? `Sending ${files.length} existing file(s) as context…`
      : "Analyzing requirements and selecting optimal stack…");

    await stream(
      `${BASE}/api/generate/site`,
      { prompt, mode: buildMode, existingFiles: isUpdate ? files : undefined },
      (token) => setStreamingRaw(s => s + token),
      (full) => {
        const parsed = parseFiles(full);
        setFiles(parsed);
        setStreamingRaw("");
        if (!activeFile || !parsed.find(f => f.name === activeFile)) {
          setActiveFile(parsed[0]?.name ?? "");
        }
        setGenerating(false);

        const stack = detectStack(parsed);
        setDetectedStack(stack);

        const record: BuildRecord = {
          id: Date.now().toString(36),
          prompt: prompt.slice(0, 80),
          mode: buildMode,
          files: parsed,
          builtAt: new Date().toLocaleString(),
          version: buildHistory.length + 1,
        };
        setBuildHistory(h => [record, ...h.slice(0, 19)]);

        addLog(`Stack: ${stack}`);
        addLog(`✓ ${isUpdate ? "Update" : "Build"} complete · ${parsed.length} file(s)`);
        parsed.forEach(f => addLog(`  ✓ ${f.name} (${f.content.length.toLocaleString()} chars)`));
        toast.success(`${isUpdate ? "Updated" : "Generated"} ${parsed.length} file(s)!`);
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
      setStreamingRaw("");
    });
  };

  // ─── Deploy ──────────────────────────────────────────────────────────────────
  const deployToServer = async () => {
    const previewDoc = buildPreviewDoc(files);
    const htmlContent = previewDoc || files.find(f => f.name.endsWith(".html"))?.content || files[0]?.content;
    if (!htmlContent) return;
    setDeploying(true);
    addLog("Publishing to XDIGITEX hosting…");
    try {
      const res = await fetch(`${BASE}/api/generate/deploy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: htmlContent, name: prompt.slice(0, 40) }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { id: string; name: string; url: string };
      const dep: DeployedSite = { ...data, deployedAt: new Date().toLocaleString() };
      setDeployments(d => [dep, ...d]);
      setActiveTab("deploy");
      addLog(`✓ Published: ${data.url}`);
      toast.success("Published successfully!");
    } catch (e: any) {
      toast.error(`Publish failed: ${e.message}`);
      addLog(`✗ Publish error: ${e.message}`);
    } finally {
      setDeploying(false);
    }
  };

  // ─── ZIP download ─────────────────────────────────────────────────────────────
  const downloadZip = async (sourceFiles?: GeneratedFile[], label?: string) => {
    const target = sourceFiles ?? files;
    if (target.length === 0) return;
    const zip = new JSZip();
    const folder = zip.folder("project")!;
    target.forEach(f => folder.file(f.name, f.content));
    if (!target.find(f => f.name === "README.md")) {
      folder.file("README.md", `# Project\n\nBuilt with XDIGITEX AI\n\nPrompt: ${prompt}\nStack: ${detectedStack}\nGenerated: ${new Date().toISOString()}\n`);
    }
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(label ?? prompt).slice(0, 30).replace(/[^a-z0-9]/gi, "-").toLowerCase() || "project"}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("ZIP downloaded!");
  };

  // ─── Single file download ─────────────────────────────────────────────────────
  const downloadFile = (f: GeneratedFile) => {
    const blob = new Blob([f.content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = f.name.split("/").pop() ?? f.name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ─── File upload handler ──────────────────────────────────────────────────────
  const handleUpload = async (uploadedFiles: FileList | null) => {
    if (!uploadedFiles || uploadedFiles.length === 0) return;
    const newFiles: GeneratedFile[] = [...files];
    let added = 0;
    for (const file of Array.from(uploadedFiles)) {
      if (file.name.endsWith(".zip")) {
        try {
          const zip = await JSZip.loadAsync(file);
          for (const [path, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const name = path.replace(/^[^/]+\//, "");
            if (!name) continue;
            const content = await entry.async("text");
            const ext = name.split(".").pop() ?? "txt";
            const idx = newFiles.findIndex(f => f.name === name);
            if (idx >= 0) newFiles[idx] = { name, content, language: getLanguage(ext) };
            else newFiles.push({ name, content, language: getLanguage(ext) });
            added++;
          }
        } catch { toast.error(`Failed to parse ${file.name}`); }
      } else {
        const content = await file.text();
        const name = file.name;
        const ext = name.split(".").pop() ?? "txt";
        const idx = newFiles.findIndex(f => f.name === name);
        if (idx >= 0) newFiles[idx] = { name, content, language: getLanguage(ext) };
        else newFiles.push({ name, content, language: getLanguage(ext) });
        added++;
      }
    }
    setFiles(newFiles);
    if (newFiles[0] && !activeFile) setActiveFile(newFiles[0].name);
    addLog(`✓ Uploaded ${added} file(s)`);
    toast.success(`${added} file(s) added to project`);
  };

  // ─── Drag and drop ────────────────────────────────────────────────────────────
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  };

  // ─── File management ──────────────────────────────────────────────────────────
  const deleteFile = (name: string) => {
    const next = files.filter(f => f.name !== name);
    setFiles(next);
    if (activeFile === name) setActiveFile(next[0]?.name ?? "");
    addLog(`Deleted: ${name}`);
  };

  const renameFile = (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) { setRenamingFile(null); return; }
    setFiles(f => f.map(f => f.name === oldName ? { ...f, name: newName.trim() } : f));
    if (activeFile === oldName) setActiveFile(newName.trim());
    setRenamingFile(null);
  };

  const addNewFile = () => {
    const name = `untitled-${Date.now().toString(36)}.txt`;
    setFiles(f => [...f, { name, content: "", language: "text" }]);
    setActiveFile(name);
    setTimeout(() => setRenamingFile(name), 50);
    setRenameValue(name);
  };

  const editFileContent = (name: string, content: string) => {
    setFiles(f => f.map(f => f.name === name ? { ...f, content } : f));
  };

  // ─── Restore from history ─────────────────────────────────────────────────────
  const restoreFromHistory = (record: BuildRecord) => {
    setFiles(record.files);
    setActiveFile(record.files[0]?.name ?? "");
    setPrompt(record.prompt);
    setBuildMode(record.mode);
    setActiveTab("files");
    toast.success(`v${record.version} restored`);
  };

  // ─── Chat send ────────────────────────────────────────────────────────────────
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
      { messages: newMsgs.map(m => ({ role: m.role, content: m.content })), mode: buildMode },
      (token) => {
        acc += token;
        setMessages(msgs => msgs.map((m, i) => i === msgs.length - 1 ? { ...m, content: acc } : m));
      },
      () => {
        setMessages(msgs => msgs.map((m, i) => i === msgs.length - 1 ? { ...m, streaming: false } : m));
        setChatLoading(false);
      },
      (err) => {
        toast.error(`Error: ${err}`);
        setMessages(msgs => msgs.map((m, i) => i === msgs.length - 1 ? { ...m, content: `Error: ${err}`, streaming: false } : m));
        setChatLoading(false);
      },
    ).catch(err => { if (err?.name !== "AbortError") toast.error("Chat interrupted"); setChatLoading(false); });
  };

  // ─── Apply AI chat response as files ─────────────────────────────────────────
  const applyFromChat = (content: string) => {
    const parsed = parseFiles(content);
    if (parsed.length === 0) { toast.error("No files found in this response"); return; }
    const merged = [...files];
    parsed.forEach(p => {
      const idx = merged.findIndex(f => f.name === p.name);
      if (idx >= 0) merged[idx] = p; else merged.push(p);
    });
    setFiles(merged);
    setActiveFile(parsed[0]?.name ?? "");
    setActiveTab("files");
    toast.success(`Applied ${parsed.length} file(s) from AI response`);
    addLog(`✓ Applied ${parsed.length} file(s) from chat`);
  };

  // ─── Derived ──────────────────────────────────────────────────────────────────
  const currentFile = files.find(f => f.name === activeFile);
  const previewDoc = buildPreviewDoc(files);
  const hasFiles = files.length > 0 || !!streamingRaw;

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "files",   label: "Files",   icon: FolderOpen },
    { id: "preview", label: "Preview", icon: Globe      },
    { id: "deploy",  label: "Deploy",  icon: Rocket     },
    { id: "logs",    label: "Logs",    icon: FileText   },
    { id: "history", label: "History", icon: History    },
  ];

  const EXAMPLE_PROMPTS = [
    "Build a SaaS invoicing platform with subscriptions",
    "Create a Telegram order bot for a restaurant",
    "Build a React CRM dashboard with charts and filters",
    "Create a FastAPI backend with JWT auth and PostgreSQL",
    "Build a landing page for a fintech startup",
    "Create a VPS monitoring script with alerts",
  ];

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-8rem)] -m-6 flex flex-col border-t border-border">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-card shrink-0">

        {/* Build mode */}
        <div className="flex items-center gap-0.5 bg-muted/50 border border-border rounded-md p-0.5 shrink-0">
          {BUILD_MODES.map(m => {
            const Icon = m.icon;
            const active = buildMode === m.id;
            return (
              <button key={m.id} onClick={() => setBuildMode(m.id)} disabled={generating} title={m.description}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  active ? "bg-background border border-border text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`w-3 h-3 ${active && m.id === "high-power" ? "text-yellow-400" : active ? "text-primary" : ""}`} />
                <span className="hidden sm:inline">{m.label}</span>
                {m.badge && active && (
                  <span className={`text-[9px] px-1 rounded ${m.id === "high-power" ? "bg-yellow-400/20 text-yellow-400" : "bg-primary/20 text-primary"}`}>
                    {m.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Prompt input */}
        <input
          className="flex-1 bg-muted/40 border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
          placeholder={isUpdate ? "Describe changes to make to your project…" : "Describe what you want to build…"}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && generate()}
          disabled={generating}
        />

        <div className="flex items-center gap-1 shrink-0">
          {/* Upload */}
          <input ref={fileInputRef} type="file" multiple accept="*/*" className="hidden"
            onChange={e => handleUpload(e.target.files)} />
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" title="Upload files or ZIP"
            onClick={() => fileInputRef.current?.click()} disabled={generating}>
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Upload</span>
          </Button>

          {/* Generate / Stop */}
          {generating ? (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs text-red-400 border-red-500/30" onClick={cancel}>
              <X className="w-3 h-3" /> Stop
            </Button>
          ) : (
            <Button onClick={generate} disabled={!prompt.trim()} size="sm" className="gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {isUpdate ? "Update" : "Build"}
            </Button>
          )}

          {hasFiles && !generating && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={deployToServer} disabled={deploying}>
                {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">Publish</span>
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground" onClick={() => downloadZip()}>
                <Download className="w-3.5 h-3.5" />
                <span className="hidden md:inline">ZIP</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Build steps progress ──────────────────────────────────────────────── */}
      {generating && (
        <div className="border-b border-primary/10 bg-primary/5 px-4 py-2 shrink-0">
          <div className="flex items-center gap-3 overflow-x-auto">
            {BUILD_STEPS.map((step, i) => {
              const Icon = step.icon;
              const done = i < buildStep;
              const active = i === buildStep;
              return (
                <div key={i} className={`flex items-center gap-1.5 text-[11px] shrink-0 transition-all ${
                  done ? "text-green-400" : active ? "text-primary" : "text-muted-foreground/30"
                }`}>
                  {done ? <CheckCheck className="w-3 h-3" /> : active ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
                  <span>{step.label}</span>
                  {i < BUILD_STEPS.length - 1 && <ChevronRight className="w-2.5 h-2.5 opacity-30 ml-1" />}
                </div>
              );
            })}
            <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{streamingRaw.length.toLocaleString()} chars</span>
          </div>
        </div>
      )}

      <ResizablePanelGroup direction="horizontal" className="flex-1 rounded-none bg-background">

        {/* ── Left: tabbed workspace ────────────────────────────────────────── */}
        <ResizablePanel defaultSize={62} minSize={35}>
          <div className="h-full flex flex-col">

            {/* Tab bar */}
            <div className="flex items-center border-b bg-card/30 shrink-0">
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === tab.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {tab.id === "deploy" && deployments.length > 0 && (
                    <span className="ml-0.5 bg-green-500/20 text-green-400 text-[10px] rounded-full px-1.5">{deployments.length}</span>
                  )}
                  {tab.id === "logs" && logs.length > 0 && (
                    <span className="ml-0.5 bg-muted text-muted-foreground text-[10px] rounded-full px-1.5">{logs.length}</span>
                  )}
                  {tab.id === "history" && buildHistory.length > 0 && (
                    <span className="ml-0.5 bg-muted text-muted-foreground text-[10px] rounded-full px-1.5">{buildHistory.length}</span>
                  )}
                </button>
              ))}
              {detectedStack && !generating && (
                <div className="ml-auto flex items-center gap-1.5 px-3 text-[10px] text-muted-foreground">
                  <Code2 className="w-3 h-3" /> {detectedStack}
                </div>
              )}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">

              {/* ── FILES ───────────────────────────────────────────────────── */}
              {activeTab === "files" && (
                <div className="h-full flex"
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                >
                  {/* File tree */}
                  <div className={`w-44 border-r bg-[#1e1e1e] shrink-0 flex flex-col transition-colors ${isDragging ? "border-primary/50 bg-primary/5" : ""}`}>
                    {/* Tree header */}
                    <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#2d2d2d] shrink-0">
                      <span className="text-[10px] font-semibold text-[#666] uppercase tracking-widest">Explorer</span>
                      <div className="flex items-center gap-0.5">
                        <button onClick={addNewFile} title="New file"
                          className="p-0.5 rounded hover:bg-[#3d3d3d] text-[#666] hover:text-[#ccc] transition-colors">
                          <Plus className="w-3 h-3" />
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} title="Upload files"
                          className="p-0.5 rounded hover:bg-[#3d3d3d] text-[#666] hover:text-[#ccc] transition-colors">
                          <Upload className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {isDragging && (
                      <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-primary text-[11px]">
                        <Upload className="w-5 h-5" />
                        Drop files here
                      </div>
                    )}

                    {!isDragging && (
                      <ScrollArea className="flex-1">
                        {files.length === 0 && !streamingRaw ? (
                          <div className="px-3 py-6 text-[11px] text-[#444] text-center leading-relaxed">
                            No files yet.<br />Build a project or<br />upload files above.
                          </div>
                        ) : (
                          <div className="py-1">
                            {files.map(f => {
                              const ext = f.name.split(".").pop() ?? "";
                              const FIcon = ["html", "css", "js", "ts", "tsx", "jsx", "vue"].includes(ext) ? FileCode2 : File;
                              const isActive = activeFile === f.name;
                              const isRenaming = renamingFile === f.name;
                              return (
                                <div key={f.name} className="group relative">
                                  {isRenaming ? (
                                    <input
                                      autoFocus
                                      className="w-full px-3 py-1.5 text-xs bg-[#37373d] text-[#d4d4d4] outline-none border border-primary/50"
                                      value={renameValue}
                                      onChange={e => setRenameValue(e.target.value)}
                                      onBlur={() => renameFile(f.name, renameValue)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") renameFile(f.name, renameValue);
                                        if (e.key === "Escape") setRenamingFile(null);
                                      }}
                                    />
                                  ) : (
                                    <button onClick={() => setActiveFile(f.name)}
                                      className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-left pr-14 transition-colors ${
                                        isActive ? "bg-[#37373d] text-[#d4d4d4]" : "text-[#888] hover:bg-[#2a2a2a] hover:text-[#ccc]"
                                      }`}
                                    >
                                      <FIcon className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                                      <span className="truncate">{f.name}</span>
                                    </button>
                                  )}
                                  {!isRenaming && (
                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                                      <button onClick={() => { setRenamingFile(f.name); setRenameValue(f.name); }} title="Rename"
                                        className="p-0.5 rounded hover:bg-[#555] text-[#666] hover:text-[#ccc]">
                                        <Code2 className="w-2.5 h-2.5" />
                                      </button>
                                      <button onClick={() => downloadFile(f)} title="Download"
                                        className="p-0.5 rounded hover:bg-[#555] text-[#666] hover:text-[#ccc]">
                                        <Download className="w-2.5 h-2.5" />
                                      </button>
                                      <button onClick={() => deleteFile(f.name)} title="Delete"
                                        className="p-0.5 rounded hover:bg-red-500/20 text-[#666] hover:text-red-400">
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {streamingRaw && files.length === 0 && (
                              <div className="px-3 py-1.5 text-xs text-[#888] flex items-center gap-1.5">
                                <Loader2 className="w-3 h-3 animate-spin text-primary" /> writing…
                              </div>
                            )}
                          </div>
                        )}
                      </ScrollArea>
                    )}
                  </div>

                  {/* Code viewer / editor */}
                  <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden">
                    {currentFile || streamingRaw ? (
                      <>
                        <div className="flex items-center justify-between bg-[#2d2d2d] border-b border-[#404040] px-3 py-1.5 shrink-0">
                          <div className="flex items-center gap-2">
                            <Code2 className="w-3.5 h-3.5 text-[#969696]" />
                            <span className="text-[#d4d4d4] text-xs">{currentFile?.name ?? "generating…"}</span>
                            {currentFile && (
                              <Badge variant="outline" className="text-[9px] border-[#555] text-[#888] px-1">
                                {currentFile.language}
                              </Badge>
                            )}
                          </div>
                          {currentFile && (
                            <div className="flex items-center gap-1">
                              <button onClick={() => downloadFile(currentFile)}
                                className="flex items-center gap-1 text-[10px] text-[#969696] hover:text-[#d4d4d4] px-2 py-0.5 rounded hover:bg-[#404040]">
                                <Download className="w-3 h-3" /> Save
                              </button>
                              <button
                                onClick={() => { navigator.clipboard.writeText(currentFile.content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                                className="flex items-center gap-1 text-[10px] text-[#969696] hover:text-[#d4d4d4] px-2 py-0.5 rounded hover:bg-[#404040]"
                              >
                                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                {copied ? "Copied" : "Copy"}
                              </button>
                            </div>
                          )}
                        </div>
                        <ScrollArea className="flex-1">
                          {currentFile ? (
                            <textarea
                              className="w-full h-full p-4 font-mono text-xs text-[#d4d4d4] leading-relaxed bg-transparent resize-none outline-none whitespace-pre"
                              value={currentFile.content}
                              onChange={e => editFileContent(currentFile.name, e.target.value)}
                              spellCheck={false}
                            />
                          ) : (
                            <pre className="p-4 font-mono text-xs text-[#d4d4d4] leading-relaxed whitespace-pre-wrap">
                              {streamingRaw.slice(0, 8000)}
                              {generating && <span className="inline-block w-2 h-4 bg-primary/80 animate-pulse ml-0.5 align-middle" />}
                            </pre>
                          )}
                        </ScrollArea>
                      </>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center gap-4 text-[#555]">
                        <Sparkles className="w-10 h-10 text-[#333]" />
                        <div className="text-center">
                          <p className="text-sm mb-1 text-[#888]">Describe what you want to build</p>
                          <p className="text-xs text-[#555]">AI selects the stack and generates all files</p>
                          <p className="text-xs text-[#444] mt-1">Or upload existing files to start from your code</p>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center max-w-md mt-2">
                          {EXAMPLE_PROMPTS.slice(0, 4).map(ex => (
                            <button key={ex} onClick={() => setPrompt(ex)}
                              className="text-[11px] text-[#666] border border-[#333] rounded px-2 py-1 hover:border-primary/50 hover:text-primary transition-colors text-left">
                              {ex}
                            </button>
                          ))}
                        </div>
                        <button onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-2 text-xs text-[#555] border border-[#333] rounded-lg px-4 py-2 hover:border-primary/40 hover:text-primary transition-colors">
                          <Upload className="w-3.5 h-3.5" /> Upload files or ZIP
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── PREVIEW ──────────────────────────────────────────────────── */}
              {activeTab === "preview" && (
                <div className="h-full flex flex-col bg-white">
                  {previewDoc ? (
                    <>
                      <div className="flex items-center gap-2 bg-[#1e1e1e] border-b border-[#404040] px-3 py-1.5 shrink-0">
                        <Globe className="w-3.5 h-3.5 text-[#969696]" />
                        <span className="text-xs text-[#d4d4d4]">Live Preview</span>
                        <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-400 gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> CSS + JS inlined
                        </Badge>
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            onClick={() => { const b = new Blob([previewDoc], { type: "text/html" }); window.open(URL.createObjectURL(b), "_blank"); }}
                            className="text-[10px] text-[#969696] hover:text-[#d4d4d4] px-2 py-0.5 rounded hover:bg-[#404040] flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" /> Open in tab
                          </button>
                        </div>
                      </div>
                      <iframe srcDoc={previewDoc} className="flex-1 border-0" sandbox="allow-scripts allow-same-origin allow-forms" title="Preview" />
                    </>
                  ) : files.find(f => f.name.endsWith(".html")) ? (
                    <>
                      <div className="flex items-center gap-2 bg-[#1e1e1e] border-b border-[#404040] px-3 py-1.5 shrink-0">
                        <Globe className="w-3.5 h-3.5 text-[#969696]" />
                        <span className="text-xs text-[#d4d4d4]">Live Preview</span>
                      </div>
                      <iframe srcDoc={files.find(f => f.name.endsWith(".html"))!.content} className="flex-1 border-0"
                        sandbox="allow-scripts allow-same-origin allow-forms" title="Preview" />
                    </>
                  ) : (
                    <div className="h-full bg-[#1a1a1a] flex flex-col items-center justify-center gap-3 text-[#555]">
                      <Globe className="w-10 h-10 text-[#333]" />
                      <p className="text-sm">{hasFiles ? "Preview is available for HTML projects" : "Build a project to see the live preview"}</p>
                      {hasFiles && <p className="text-xs text-[#444]">Generate an HTML-based project to enable preview</p>}
                    </div>
                  )}
                </div>
              )}

              {/* ── DEPLOY ───────────────────────────────────────────────────── */}
              {activeTab === "deploy" && (
                <div className="h-full overflow-y-auto">
                  <div className="p-6 space-y-6">
                    {hasFiles && !generating && (
                      <div className="border border-border/50 rounded-xl p-5 bg-card/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold">Publish to XDIGITEX Hosting</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">Deploy your HTML project to a live public URL</p>
                          </div>
                          <Button size="sm" className="gap-1.5" onClick={deployToServer} disabled={deploying}>
                            {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                            {deploying ? "Publishing…" : "Publish Now"}
                          </Button>
                        </div>
                        <div className="flex items-start gap-2 text-[11px] text-muted-foreground/60">
                          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>CSS and JS files are automatically inlined so the deployed site renders completely.</span>
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Deployment Targets</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "XDIGITEX Hosting", desc: "One-click publish", icon: "🚀", available: true },
                          { label: "Docker",            desc: "Container deploy",  icon: "🐳", available: false },
                          { label: "Railway",           desc: "Cloud hosting",     icon: "🚂", available: false },
                          { label: "Render",            desc: "Auto-deploy",       icon: "⚡", available: false },
                          { label: "AWS",               desc: "S3 + CloudFront",  icon: "☁️", available: false },
                          { label: "VPS / SSH",         desc: "Self-hosted",       icon: "🖥️", available: false },
                        ].map(t => (
                          <div key={t.label} className={`border rounded-lg p-3 flex items-center gap-3 ${t.available ? "border-primary/30 bg-primary/5" : "border-border/30 opacity-40"}`}>
                            <span className="text-xl">{t.icon}</span>
                            <div>
                              <p className="text-xs font-medium">{t.label}</p>
                              <p className="text-[10px] text-muted-foreground">{t.available ? t.desc : "Coming soon"}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Published Sites</h3>
                      {deployments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                          <Rocket className="w-8 h-8 text-muted-foreground/20" />
                          <p className="text-sm">No published sites yet</p>
                          <p className="text-xs text-muted-foreground/50">Build a project and click Publish</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {deployments.map(dep => (
                            <div key={dep.id} className="border border-border/50 rounded-lg p-3 bg-card/50 flex items-center gap-3">
                              <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20 shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{dep.name}</div>
                                <div className="text-xs text-muted-foreground">Published {dep.deployedAt}</div>
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
                </div>
              )}

              {/* ── LOGS ────────────────────────────────────────────────────── */}
              {activeTab === "logs" && (
                <div className="h-full flex flex-col bg-[#0d0d0d] font-mono">
                  <div className="flex items-center justify-between bg-[#1a1a1a] border-b border-[#2a2a2a] px-3 py-1.5 shrink-0">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-[#666]" />
                      <span className="text-xs text-[#666]">Build & Generation Logs</span>
                    </div>
                    {logs.length > 0 && (
                      <button onClick={() => setLogs([])} className="text-[10px] text-[#555] hover:text-[#888]">Clear</button>
                    )}
                  </div>
                  <ScrollArea className="flex-1 p-4">
                    {logs.length === 0 ? (
                      <div className="text-[11px] text-[#444]">No logs yet. Build a project to see logs here.</div>
                    ) : (
                      <div className="space-y-0.5">
                        {logs.map((log, i) => (
                          <div key={i} className={`text-[11px] ${
                            log.includes("✓") ? "text-green-400"
                            : log.includes("✗") || log.includes("Error") ? "text-red-400"
                            : log.includes("Update") || log.includes("Build") ? "text-primary"
                            : "text-[#888]"
                          }`}>{log}</div>
                        ))}
                        <div ref={logsEndRef} />
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}

              {/* ── HISTORY ─────────────────────────────────────────────────── */}
              {activeTab === "history" && (
                <div className="h-full overflow-y-auto">
                  <div className="p-4 space-y-3">
                    <p className="text-xs text-muted-foreground">Every successful build is saved. Restore or download any version.</p>
                    {buildHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                        <History className="w-8 h-8 text-muted-foreground/20" />
                        <p className="text-sm">No build history yet</p>
                        <p className="text-xs text-muted-foreground/50">Each successful build is saved here automatically</p>
                      </div>
                    ) : (
                      buildHistory.map(record => (
                        <div key={record.id} className="border border-border/50 rounded-lg p-3 bg-card/40 hover:bg-card/70 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] bg-primary/10 text-primary px-1.5 rounded font-mono">v{record.version}</span>
                                <span className={`text-[10px] px-1.5 rounded ${
                                  record.mode === "high-power" ? "bg-yellow-400/10 text-yellow-400"
                                  : record.mode === "balanced" ? "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground"
                                }`}>{record.mode}</span>
                              </div>
                              <p className="text-sm font-medium truncate">{record.prompt}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-muted-foreground">{record.files.length} files</span>
                                <span className="text-[10px] text-muted-foreground">·</span>
                                <span className="text-[10px] text-muted-foreground">{record.builtAt}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="sm" variant="ghost" className="text-[10px] h-7 px-2 gap-1"
                                onClick={() => downloadZip(record.files, record.prompt)}>
                                <Download className="w-3 h-3" /> ZIP
                              </Button>
                              <Button size="sm" variant="outline" className="text-[10px] h-7 px-2 gap-1"
                                onClick={() => restoreFromHistory(record)}>
                                <RotateCcw className="w-3 h-3" /> Restore
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle className="w-1 hover:bg-primary/50 transition-colors" />

        {/* ── Right: AI Chat ───────────────────────────────────────────────── */}
        <ResizablePanel defaultSize={38} minSize={25} className="border-l bg-card/30 flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-card shrink-0">
            <BotMessageSquare className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Agent</span>
            <Badge variant="outline" className="ml-auto text-[10px] gap-1 text-green-400 border-green-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live
            </Badge>
            {messages.length > 1 && (
              <button onClick={() => setMessages([{
                role: "assistant",
                content: "Hi! I'm your AI development assistant. Describe what you want to build, or ask me to make changes to your project.",
              }])} className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground">
                Clear
              </button>
            )}
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg, i) => {
                const hasFilesInContent = msg.role === "assistant" && msg.content.includes("=== FILE:");
                return (
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
                    {/* Apply to project button for AI responses with file blocks */}
                    {hasFilesInContent && !msg.streaming && (
                      <button
                        onClick={() => applyFromChat(msg.content)}
                        className="flex items-center gap-1.5 text-[11px] text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 rounded-md px-2.5 py-1 transition-colors"
                      >
                        <CheckCheck className="w-3 h-3" /> Apply to project
                      </button>
                    )}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>

          {/* Quick prompts */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 flex flex-col gap-1.5">
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Quick start</p>
              {EXAMPLE_PROMPTS.slice(0, 4).map(ex => (
                <button key={ex} onClick={() => setPrompt(ex)}
                  className="text-left text-xs text-muted-foreground border border-border/40 rounded-md px-3 py-1.5 hover:bg-muted/40 hover:text-foreground transition-colors">
                  {ex}
                </button>
              ))}
            </div>
          )}

          <div className="p-3 border-t bg-card shrink-0">
            <div className="flex gap-2">
              <textarea
                rows={2}
                placeholder={files.length > 0 ? "Ask AI to modify, explain, or extend your project…" : "Ask anything or describe changes to make…"}
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
