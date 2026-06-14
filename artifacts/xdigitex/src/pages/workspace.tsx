import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, Sparkles, Globe, Code2, FileText, Rocket, X,
  Download, CheckCircle2, Copy, Check, FolderOpen, File, FileCode2, RefreshCw,
  History, Zap, BarChart3, Crown, Plus, Trash2, Upload, GitBranch, RotateCcw,
  ChevronRight, Package, Database, Cpu, Layers, CheckCheck, Terminal,
  ExternalLink, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const STORAGE_KEY = "xdx_workspace_v4";

// ─── Types ────────────────────────────────────────────────────────────────────
type BuildMode = "economy" | "balanced" | "high-power";
type Tab = "files" | "preview" | "deploy" | "logs" | "history" | "console";
type GeneratedFile = { name: string; content: string; language: string };
type DeployedSite = { id: string; name: string; url: string; deployedAt: string };
type BuildRecord = {
  id: string; prompt: string; mode: BuildMode;
  files: GeneratedFile[]; builtAt: string; version: number;
};
type ConsoleEntry = {
  id: string; prompt: string; mode: BuildMode;
  summary: string; filesChanged: string[]; isNew: boolean; at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const BUILD_MODES: { id: BuildMode; label: string; desc: string; icon: React.ElementType; badge?: string }[] = [
  { id: "economy",    label: "Economy",    desc: "DeepSeek · fast & cheap",        icon: Zap,      },
  { id: "balanced",   label: "Balanced",   desc: "DeepSeek · quality + speed",     icon: BarChart3, badge: "Default" },
  { id: "high-power", label: "High Power", desc: "Claude 3.5 Sonnet · best quality", icon: Crown,   badge: "Premium" },
];

const BUILD_STEPS = [
  { icon: Cpu,       label: "Analyzing requirements"  },
  { icon: GitBranch, label: "Planning architecture"   },
  { icon: Database,  label: "Designing data models"   },
  { icon: Layers,    label: "Generating backend"      },
  { icon: Globe,     label: "Building frontend"       },
  { icon: Package,   label: "Packaging project files" },
];

// ─── Utils ────────────────────────────────────────────────────────────────────
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

function parseFiles(raw: string): GeneratedFile[] {
  const filePattern = /=== FILE: (.+?) ===\n([\s\S]*?)(?==== FILE:|=== SUMMARY:|$)/g;
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
    const isPy   = /^(import|from|def |class |#!\/usr\/bin\/env python)/.test(content.trimStart());
    const isGo   = content.trimStart().startsWith("package ");
    const isSh   = content.trimStart().startsWith("#!");
    const fileName = isHtml ? "index.html" : isPy ? "main.py" : isGo ? "main.go" : isSh ? "script.sh" : "index.js";
    files.push({ name: fileName, content, language: getLanguage(fileName.split(".").pop() ?? "txt") });
  }
  return files;
}

function extractSummary(raw: string): string {
  const m = raw.match(/===\s*SUMMARY:\s*===\s*\n?([\s\S]+?)(?:===|$)/i);
  if (m?.[1]?.trim()) return m[1].trim();
  // Fallback: strip file blocks, return remaining non-empty text
  const stripped = raw
    .replace(/===\s*FILE:\s*[^\n]+\s*===\n[\s\S]*?(?====|\s*$)/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
  return stripped.slice(0, 400) || "Files updated successfully.";
}

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

function detectStack(files: GeneratedFile[]) {
  const exts = [...new Set(files.map(f => f.name.split(".").pop()))].filter(Boolean);
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
    let buf = "", full = "";
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
        if (event === "token") { full += payload; onToken(payload); }
        else if (event === "done") onDone(full || payload);
        else if (event === "error") onError(payload);
      }
    }
  }, []);
  return { stream, cancel: () => abort.current?.abort() };
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Workspace() {
  const saved = loadWorkspace();

  const [buildMode, setBuildMode]     = useState<BuildMode>(saved.buildMode ?? "balanced");
  const [prompt, setPrompt]           = useState(saved.prompt ?? "");
  const [generating, setGenerating]   = useState(false);
  const [streamingRaw, setStreamingRaw] = useState("");
  const [buildStep, setBuildStep]     = useState(0);

  const [files, setFiles]             = useState<GeneratedFile[]>(saved.files ?? []);
  const [activeFile, setActiveFile]   = useState<string>(saved.activeFile ?? "");
  const [activeTab, setActiveTab]     = useState<Tab>("files");
  const [logs, setLogs]               = useState<string[]>(saved.logs ?? []);
  const [deployments, setDeployments] = useState<DeployedSite[]>(saved.deployments ?? []);
  const [buildHistory, setBuildHistory] = useState<BuildRecord[]>(saved.buildHistory ?? []);
  const [buildLog, setBuildLog]       = useState<ConsoleEntry[]>(saved.buildLog ?? []);
  const [deploying, setDeploying]     = useState(false);
  const [copied, setCopied]           = useState(false);
  const [detectedStack, setDetectedStack] = useState<string>(saved.detectedStack ?? "");
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isDragging, setIsDragging]   = useState(false);

  const logsEndRef  = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef   = useRef<HTMLInputElement>(null);

  const { stream, cancel } = useSSEStream();

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  // ─── Persist ────────────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      buildMode, prompt, files, activeFile,
      logs: logs.slice(-100), deployments,
      buildHistory: buildHistory.slice(0, 20),
      buildLog: buildLog.slice(0, 30),
      detectedStack,
    }));
  }, [buildMode, prompt, files, activeFile, logs, deployments, buildHistory, buildLog, detectedStack]);

  // ─── Build step animation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!generating) { setBuildStep(0); return; }
    const id = setInterval(() => setBuildStep(s => Math.min(s + 1, BUILD_STEPS.length - 1)), 2800);
    return () => clearInterval(id);
  }, [generating]);

  const addLog = (msg: string) =>
    setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  // ─── Generate / Update ────────────────────────────────────────────────────────
  const isUpdate = files.length > 0;

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    const currentPrompt = prompt;
    setGenerating(true);
    setStreamingRaw("");
    if (!isUpdate) { setFiles([]); setActiveFile(""); setDetectedStack(""); }
    setActiveTab("files");
    addLog(isUpdate
      ? `Update · mode: ${buildMode} · "${currentPrompt}"`
      : `Build · mode: ${buildMode} · "${currentPrompt}"`);

    await stream(
      `${BASE}/api/generate/site`,
      { prompt: currentPrompt, mode: buildMode, existingFiles: isUpdate ? files : undefined },
      (token) => setStreamingRaw(s => s + token),
      (full) => {
        const parsed = parseFiles(full);
        const summary = extractSummary(full);

        // For updates: merge changed files; for fresh builds: replace all
        if (isUpdate) {
          setFiles(prev => {
            const merged = [...prev];
            parsed.forEach(p => {
              const i = merged.findIndex(f => f.name === p.name);
              if (i >= 0) merged[i] = p; else merged.push(p);
            });
            return merged;
          });
        } else {
          setFiles(parsed);
        }

        setStreamingRaw("");
        setGenerating(false);

        // Keep active file if it still exists; else pick first
        setActiveFile(prev =>
          parsed.find(f => f.name === prev) ? prev : (parsed[0]?.name ?? ""),
        );

        const allFiles = isUpdate ? files : parsed;
        const stack = detectStack(isUpdate ? [...files, ...parsed] : parsed);
        setDetectedStack(stack);

        // History record (full merged state)
        const newVersion = buildHistory.length + 1;
        setBuildHistory(h => [{
          id: Date.now().toString(36),
          prompt: currentPrompt.slice(0, 80),
          mode: buildMode,
          files: isUpdate ? (() => { const m = [...files]; parsed.forEach(p => { const i = m.findIndex(f => f.name === p.name); if (i >= 0) m[i] = p; else m.push(p); }); return m; })() : parsed,
          builtAt: new Date().toLocaleString(),
          version: newVersion,
        }, ...h.slice(0, 19)]);

        // Console log entry
        setBuildLog(l => [{
          id: Date.now().toString(36),
          prompt: currentPrompt,
          mode: buildMode,
          summary,
          filesChanged: parsed.map(f => f.name),
          isNew: !isUpdate,
          at: new Date().toLocaleString(),
        }, ...l.slice(0, 29)]);

        addLog(`✓ ${isUpdate ? "Updated" : "Built"} · ${parsed.length} file(s)`);
        parsed.forEach(f => addLog(`  ✓ ${f.name}`));
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
    if (!htmlContent) { toast.error("No HTML file found to publish"); return; }
    setDeploying(true);
    addLog("Publishing to XDIGITEX Hosting…");
    try {
      const res = await fetch(`${BASE}/api/generate/deploy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: htmlContent, name: prompt.slice(0, 40) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { id: string; name: string; url: string };
      const dep: DeployedSite = { ...data, deployedAt: new Date().toLocaleString() };
      setDeployments(d => [dep, ...d]);
      setActiveTab("deploy");
      addLog(`✓ Published: ${data.url}`);
      toast.success("Published successfully!");
    } catch (e: any) {
      toast.error(`Publish failed: ${e.message}`);
      addLog(`✗ Publish error: ${e.message}`);
    } finally { setDeploying(false); }
  };

  // ─── Downloads ────────────────────────────────────────────────────────────────
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

  const downloadFile = (f: GeneratedFile) => {
    const blob = new Blob([f.content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = f.name.split("/").pop() ?? f.name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ─── File upload ─────────────────────────────────────────────────────────────
  const handleUpload = async (uploadedFiles: FileList | null) => {
    if (!uploadedFiles?.length) return;
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
        } catch { toast.error(`Could not parse ${file.name}`); }
      } else {
        const content = await file.text();
        const ext = file.name.split(".").pop() ?? "txt";
        const idx = newFiles.findIndex(f => f.name === file.name);
        if (idx >= 0) newFiles[idx] = { name: file.name, content, language: getLanguage(ext) };
        else newFiles.push({ name: file.name, content, language: getLanguage(ext) });
        added++;
      }
    }
    setFiles(newFiles);
    if (!activeFile && newFiles[0]) setActiveFile(newFiles[0].name);
    addLog(`✓ Uploaded ${added} file(s)`);
    toast.success(`${added} file(s) added to project`);
  };

  // ─── File management ──────────────────────────────────────────────────────────
  const deleteFile = (name: string) => {
    setFiles(prev => {
      const next = prev.filter(f => f.name !== name);
      if (activeFile === name) setActiveFile(next[0]?.name ?? "");
      return next;
    });
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
    setTimeout(() => { setRenamingFile(name); setRenameValue(name); }, 50);
  };

  const editFileContent = (name: string, content: string) =>
    setFiles(f => f.map(f => f.name === name ? { ...f, content } : f));

  // ─── Restore from history ─────────────────────────────────────────────────────
  const restoreFromHistory = (record: BuildRecord) => {
    setFiles(record.files);
    setActiveFile(record.files[0]?.name ?? "");
    setPrompt(record.prompt);
    setBuildMode(record.mode);
    setActiveTab("files");
    toast.success(`v${record.version} restored`);
  };

  // ─── Derived ──────────────────────────────────────────────────────────────────
  const currentFile = files.find(f => f.name === activeFile);
  const previewDoc  = buildPreviewDoc(files);
  const hasFiles    = files.length > 0 || !!streamingRaw;

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "files",   label: "Files",   icon: FolderOpen },
    { id: "preview", label: "Preview", icon: Globe      },
    { id: "deploy",  label: "Deploy",  icon: Rocket     },
    { id: "logs",    label: "Logs",    icon: FileText   },
    { id: "history", label: "History", icon: History    },
    { id: "console", label: "Console", icon: Terminal   },
  ];

  const EXAMPLE_PROMPTS = [
    "Build a SaaS invoicing platform with subscriptions",
    "Create a Telegram order bot for a restaurant",
    "Build a React CRM dashboard with charts and filters",
    "Create a FastAPI backend with JWT auth and PostgreSQL",
    "Build a landing page for a fintech startup",
    "Create a VPS monitoring dashboard with alerts",
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
              <button key={m.id} onClick={() => setBuildMode(m.id)} disabled={generating}
                title={m.desc}
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

        {/* Prompt */}
        <input
          ref={promptRef}
          className="flex-1 bg-muted/40 border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
          placeholder={isUpdate
            ? "Describe a change — AI will modify only affected files…"
            : "Describe what you want to build…"}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && generate()}
          disabled={generating}
        />

        <div className="flex items-center gap-1 shrink-0">
          {/* Upload */}
          <input ref={fileInputRef} type="file" multiple accept="*/*" className="hidden"
            onChange={e => handleUpload(e.target.files)} />
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground"
            title="Upload files or ZIP" onClick={() => fileInputRef.current?.click()} disabled={generating}>
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

      {/* ── Build step progress ───────────────────────────────────────────────── */}
      {generating && (
        <div className="border-b border-primary/10 bg-primary/5 px-4 py-2 shrink-0">
          <div className="flex items-center gap-3 overflow-x-auto">
            {BUILD_STEPS.map((step, i) => {
              const Icon = step.icon;
              const done = i < buildStep;
              const active = i === buildStep;
              return (
                <div key={i} className={`flex items-center gap-1.5 text-[11px] shrink-0 ${
                  done ? "text-green-400" : active ? "text-primary" : "text-muted-foreground/25"
                }`}>
                  {done ? <CheckCheck className="w-3 h-3" /> : active ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
                  <span>{step.label}</span>
                  {i < BUILD_STEPS.length - 1 && <ChevronRight className="w-2.5 h-2.5 opacity-20 ml-1" />}
                </div>
              );
            })}
            <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{streamingRaw.length.toLocaleString()} chars</span>
          </div>
        </div>
      )}

      {/* ── Workspace (full width) ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

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
              {tab.id === "deploy"  && deployments.length > 0  && <span className="ml-0.5 bg-green-500/20 text-green-400 text-[10px] rounded-full px-1.5">{deployments.length}</span>}
              {tab.id === "history" && buildHistory.length > 0 && <span className="ml-0.5 bg-muted text-muted-foreground text-[10px] rounded-full px-1.5">{buildHistory.length}</span>}
              {tab.id === "console" && buildLog.length > 0     && <span className="ml-0.5 bg-primary/20 text-primary text-[10px] rounded-full px-1.5">{buildLog.length}</span>}
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

          {/* ── FILES ─────────────────────────────────────────────────────────── */}
          {activeTab === "files" && (
            <div className="h-full flex"
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); handleUpload(e.dataTransfer.files); }}
            >
              {/* File tree */}
              <div className={`w-52 border-r bg-[#1e1e1e] shrink-0 flex flex-col transition-colors ${isDragging ? "bg-primary/10 border-primary/40" : ""}`}>
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#2d2d2d] shrink-0">
                  <span className="text-[10px] font-semibold text-[#666] uppercase tracking-widest">Explorer</span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={addNewFile} title="New file"
                      className="p-0.5 rounded hover:bg-[#3d3d3d] text-[#666] hover:text-[#ccc]"><Plus className="w-3 h-3" /></button>
                    <button onClick={() => fileInputRef.current?.click()} title="Upload"
                      className="p-0.5 rounded hover:bg-[#3d3d3d] text-[#666] hover:text-[#ccc]"><Upload className="w-3 h-3" /></button>
                    {files.length > 0 && (
                      <button onClick={() => downloadZip()} title="Download ZIP"
                        className="p-0.5 rounded hover:bg-[#3d3d3d] text-[#666] hover:text-[#ccc]"><Download className="w-3 h-3" /></button>
                    )}
                  </div>
                </div>

                {isDragging ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-primary/70 text-[11px]">
                    <Upload className="w-5 h-5" /> Drop files here
                  </div>
                ) : (
                  <ScrollArea className="flex-1">
                    {files.length === 0 && !streamingRaw ? (
                      <div className="px-3 py-8 text-[11px] text-[#444] text-center leading-relaxed">
                        No files yet.<br />Build or upload to start.
                      </div>
                    ) : (
                      <div className="py-1">
                        {files.map(f => {
                          const ext = f.name.split(".").pop() ?? "";
                          const FIcon = ["html", "css", "js", "ts", "tsx", "jsx", "vue"].includes(ext) ? FileCode2 : File;
                          return (
                            <div key={f.name} className="group relative">
                              {renamingFile === f.name ? (
                                <input autoFocus
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
                                    activeFile === f.name ? "bg-[#37373d] text-[#d4d4d4]" : "text-[#888] hover:bg-[#2a2a2a] hover:text-[#ccc]"
                                  }`}
                                >
                                  <FIcon className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                                  <span className="truncate">{f.name}</span>
                                </button>
                              )}
                              {renamingFile !== f.name && (
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                                  <button onClick={() => { setRenamingFile(f.name); setRenameValue(f.name); }}
                                    title="Rename" className="p-0.5 rounded hover:bg-[#555] text-[#666] hover:text-[#ccc]">
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

              {/* Code editor */}
              <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden">
                {currentFile || streamingRaw ? (
                  <>
                    <div className="flex items-center justify-between bg-[#2d2d2d] border-b border-[#404040] px-3 py-1.5 shrink-0">
                      <div className="flex items-center gap-2">
                        <Code2 className="w-3.5 h-3.5 text-[#969696]" />
                        <span className="text-[#d4d4d4] text-xs">{currentFile?.name ?? "generating…"}</span>
                        {currentFile && (
                          <span className="text-[9px] border border-[#555] text-[#888] px-1.5 rounded">{currentFile.language}</span>
                        )}
                      </div>
                      {currentFile && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => downloadFile(currentFile)}
                            className="flex items-center gap-1 text-[10px] text-[#969696] hover:text-[#d4d4d4] px-2 py-0.5 rounded hover:bg-[#404040]">
                            <Download className="w-3 h-3" /> Save
                          </button>
                          <button onClick={() => { navigator.clipboard.writeText(currentFile.content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                            className="flex items-center gap-1 text-[10px] text-[#969696] hover:text-[#d4d4d4] px-2 py-0.5 rounded hover:bg-[#404040]">
                            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                            {copied ? "Copied" : "Copy"}
                          </button>
                        </div>
                      )}
                    </div>
                    <ScrollArea className="flex-1">
                      {currentFile ? (
                        <textarea
                          className="w-full h-full min-h-[400px] p-4 font-mono text-xs text-[#d4d4d4] leading-relaxed bg-transparent resize-none outline-none"
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
                      <p className="text-xs text-[#555]">AI picks the stack and generates all files</p>
                      <p className="text-xs text-[#444] mt-1">Or upload existing files to modify them</p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center max-w-lg mt-2">
                      {EXAMPLE_PROMPTS.map(ex => (
                        <button key={ex} onClick={() => { setPrompt(ex); promptRef.current?.focus(); }}
                          className="text-[11px] text-[#666] border border-[#333] rounded px-2 py-1 hover:border-primary/50 hover:text-primary transition-colors text-left">
                          {ex}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 text-xs text-[#555] border border-[#333] rounded-lg px-4 py-2 hover:border-primary/40 hover:text-primary transition-colors mt-1">
                      <Upload className="w-3.5 h-3.5" /> Upload files or ZIP
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PREVIEW ─────────────────────────────────────────────────────── */}
          {activeTab === "preview" && (
            <div className="h-full flex flex-col">
              {previewDoc || files.find(f => f.name.endsWith(".html")) ? (
                <>
                  <div className="flex items-center gap-2 bg-[#1e1e1e] border-b border-[#404040] px-3 py-1.5 shrink-0">
                    <Globe className="w-3.5 h-3.5 text-[#969696]" />
                    <span className="text-xs text-[#d4d4d4]">Live Preview</span>
                    {previewDoc && (
                      <span className="text-[10px] border border-green-500/30 text-green-400 gap-1 px-1.5 rounded flex items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> CSS + JS inlined
                      </span>
                    )}
                    <button
                      onClick={() => {
                        const doc = previewDoc || files.find(f => f.name.endsWith(".html"))!.content;
                        const b = new Blob([doc], { type: "text/html" });
                        window.open(URL.createObjectURL(b), "_blank");
                      }}
                      className="ml-auto text-[10px] text-[#969696] hover:text-[#d4d4d4] px-2 py-0.5 rounded hover:bg-[#404040] flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Open in tab
                    </button>
                  </div>
                  <iframe
                    srcDoc={previewDoc || files.find(f => f.name.endsWith(".html"))!.content}
                    className="flex-1 border-0 bg-white"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    title="Preview"
                  />
                </>
              ) : (
                <div className="h-full bg-[#1a1a1a] flex flex-col items-center justify-center gap-3 text-[#555]">
                  <Globe className="w-10 h-10 text-[#333]" />
                  <p className="text-sm">{hasFiles ? "Preview available for HTML projects only" : "Build a project to see the live preview"}</p>
                </div>
              )}
            </div>
          )}

          {/* ── DEPLOY ──────────────────────────────────────────────────────── */}
          {activeTab === "deploy" && (
            <div className="h-full overflow-y-auto">
              <div className="p-6 max-w-3xl space-y-6">

                {/* Publish card */}
                {hasFiles && !generating && (
                  <div className="border border-border/60 rounded-xl p-5 bg-card/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">Publish to XDIGITEX Hosting</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Deploy your project to a public URL. CSS and JS are bundled automatically.</p>
                      </div>
                      <Button size="sm" className="gap-1.5" onClick={deployToServer} disabled={deploying}>
                        {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                        {deploying ? "Publishing…" : "Publish Now"}
                      </Button>
                    </div>
                    {!previewDoc && files.length > 0 && (
                      <div className="flex items-start gap-2 text-[11px] text-muted-foreground/60 border-t border-border/30 pt-2">
                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>No HTML file found. Publishing non-HTML projects requires running them locally or on a server.</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Deployment targets */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Deployment Targets</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {[
                      { label: "XDIGITEX Hosting", desc: "One-click static hosting",  available: true  },
                      { label: "Docker",            desc: "Container deployment",       available: false },
                      { label: "Railway",           desc: "Cloud hosting platform",     available: false },
                      { label: "Render",            desc: "Auto-deploy from Git",       available: false },
                      { label: "AWS",               desc: "S3 + CloudFront CDN",        available: false },
                      { label: "VPS / SSH",         desc: "Self-hosted server",         available: false },
                    ].map(t => (
                      <div key={t.label} className={`border rounded-lg p-3 ${t.available ? "border-primary/30 bg-primary/5" : "border-border/30 opacity-40"}`}>
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-xs font-medium">{t.label}</p>
                          <span className={`text-[10px] px-1.5 rounded ${t.available ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>
                            {t.available ? "Available" : "Coming Soon"}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Published sites */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Published Sites</h3>
                  {deployments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                      <Rocket className="w-8 h-8 text-muted-foreground/20" />
                      <p className="text-sm">No published sites yet</p>
                      <p className="text-xs text-muted-foreground/50">Build a project and click Publish to go live</p>
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

          {/* ── LOGS ────────────────────────────────────────────────────────── */}
          {activeTab === "logs" && (
            <div className="h-full flex flex-col bg-[#0d0d0d] font-mono">
              <div className="flex items-center justify-between bg-[#1a1a1a] border-b border-[#2a2a2a] px-3 py-1.5 shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-[#666]" />
                  <span className="text-xs text-[#666]">Build Logs</span>
                </div>
                {logs.length > 0 && (
                  <button onClick={() => setLogs([])} className="text-[10px] text-[#555] hover:text-[#888]">Clear</button>
                )}
              </div>
              <ScrollArea className="flex-1 p-4">
                {logs.length === 0 ? (
                  <div className="text-[11px] text-[#444]">No logs yet. Build or update a project to see activity here.</div>
                ) : (
                  <div className="space-y-0.5">
                    {logs.map((log, i) => (
                      <div key={i} className={`text-[11px] ${
                        log.includes("✓") ? "text-green-400"
                        : log.includes("✗") || log.includes("Error") ? "text-red-400"
                        : log.includes("Build") || log.includes("Update") ? "text-primary"
                        : "text-[#888]"
                      }`}>{log}</div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {/* ── HISTORY ─────────────────────────────────────────────────────── */}
          {activeTab === "history" && (
            <div className="h-full overflow-y-auto">
              <div className="p-4 max-w-3xl space-y-3">
                <p className="text-xs text-muted-foreground">Every build is saved. Restore or download any version.</p>
                {buildHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                    <History className="w-8 h-8 text-muted-foreground/20" />
                    <p className="text-sm">No builds yet</p>
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

          {/* ── CONSOLE ─────────────────────────────────────────────────────── */}
          {activeTab === "console" && (
            <div className="h-full overflow-y-auto">
              <div className="p-4 max-w-3xl space-y-3">
                <p className="text-xs text-muted-foreground">Project AI activity — what was built, what changed, and why.</p>
                {buildLog.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                    <Terminal className="w-8 h-8 text-muted-foreground/20" />
                    <p className="text-sm">No AI activity yet</p>
                    <p className="text-xs text-muted-foreground/50">Build a project to see the AI's work log here</p>
                  </div>
                ) : (
                  buildLog.map(entry => (
                    <div key={entry.id} className="border border-border/50 rounded-lg p-4 bg-card/40 space-y-3">
                      {/* Prompt */}
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0 mt-0.5">You</span>
                        <p className="text-sm text-foreground">{entry.prompt}</p>
                      </div>

                      {/* AI response */}
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded shrink-0 mt-0.5">AI</span>
                        <div className="flex-1 space-y-2">
                          {/* Files changed */}
                          {entry.filesChanged.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                {entry.isNew ? "Created" : "Modified"}
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {entry.filesChanged.map(f => (
                                  <span key={f} className="text-[11px] font-mono bg-[#1e1e1e] border border-[#333] text-[#ce9178] px-1.5 py-0.5 rounded">
                                    {f}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Summary */}
                          <p className="text-sm text-muted-foreground leading-relaxed">{entry.summary}</p>
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-2 border-t border-border/30 pt-2">
                        <span className={`text-[10px] px-1.5 rounded ${
                          entry.mode === "high-power" ? "bg-yellow-400/10 text-yellow-400"
                          : entry.mode === "balanced" ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                        }`}>{entry.mode}</span>
                        <span className="text-[10px] text-muted-foreground/50 ml-auto">{entry.at}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
