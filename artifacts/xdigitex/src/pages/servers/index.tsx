import { useState, useRef, useEffect, useCallback } from "react";
import { useListServers } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Server, Plus, Terminal, Bot, Wifi, Loader2, Play, Trash2,
  CheckCircle2, XCircle, Key, Lock, Send, Sparkles,
  ChevronDown, ChevronRight, RotateCcw, X, Paperclip, FileArchive,
  History, Zap, Clock, FileText,
} from "lucide-react";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServerRow {
  id: number; name: string; host: string; port: number;
  username: string; authType: "key" | "password";
  provider: string; location: string;
  status: "online" | "offline" | "error" | "connecting";
  createdAt: string;
}

// Display message types for the chat UI
type ChatMsg =
  | { kind: "user";         text: string }
  | { kind: "think";        text: string }
  | { kind: "cmd";          index: number; cmd: string; desc: string; output: string; exitCode?: number; open?: boolean }
  | { kind: "browser_shot"; index: number; label: string; data: string }
  | { kind: "browser_text"; index: number; text: string }
  | { kind: "browser_err";  index: number; type: string; error: string }
  | { kind: "reply";        text: string }
  | { kind: "done";         text: string }
  | { kind: "error";        text: string }
  | { kind: "tokens";       prompt: number; completion: number; total: number; iters: number; model: string; durationMs: number };

interface TaskHistoryRow {
  id: number; serverId: number; task: string; summary: string | null;
  model: string | null; promptTokens: number; completionTokens: number;
  totalTokens: number; iterations: number; durationMs: number; createdAt: string;
}

// AI conversation history (sent to backend)
interface AIMsg { role: "user" | "assistant"; content: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusDot({ s }: { s: string }) {
  const c = s === "online" ? "bg-green-400" : s === "error" ? "bg-red-400" : s === "connecting" ? "bg-blue-400 animate-pulse" : "bg-zinc-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${c}`} />;
}
function statusBadge(s: string) {
  if (s === "online")     return "bg-green-500/10 text-green-400 border-green-500/20";
  if (s === "error")      return "bg-red-500/10 text-red-400 border-red-500/20";
  if (s === "connecting") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
}

// ─── Terminal line types ──────────────────────────────────────────────────────

type TerminalLine =
  | { kind: "cmd"; text: string }
  | { kind: "out"; text: string }
  | { kind: "err"; text: string }
  | { kind: "info"; text: string }
  | { kind: "ok"; text: string };

function TerminalView({ lines, loading }: { lines: TerminalLine[]; loading?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [lines]);
  return (
    <div ref={ref} className="bg-black/90 rounded-lg border border-zinc-800 font-mono text-xs p-3 h-64 overflow-y-auto space-y-0.5 select-text">
      {lines.length === 0 && !loading && <span className="text-zinc-600">No output yet.</span>}
      {lines.map((l, i) => (
        <div key={i} className={
          l.kind === "cmd"  ? "text-purple-400" :
          l.kind === "err"  ? "text-red-400" :
          l.kind === "info" ? "text-blue-400" :
          l.kind === "ok"   ? "text-green-400" : "text-zinc-200"
        }>
          {l.kind === "cmd" && <span className="text-zinc-500 mr-1">$</span>}
          {l.text}
        </div>
      ))}
      {loading && (
        <div className="flex items-center gap-1.5 text-zinc-500">
          <Loader2 className="w-3 h-3 animate-spin" /><span>running…</span>
        </div>
      )}
    </div>
  );
}

// ─── Command block inside chat ────────────────────────────────────────────────

function CmdBlock({ msg, onToggle }: { msg: Extract<ChatMsg, { kind: "cmd" }>; onToggle: () => void }) {
  const isRunning = msg.exitCode === undefined;
  const ok        = msg.exitCode === 0;
  const failed    = !isRunning && !ok;
  const lines     = msg.output ? msg.output.split("\n").filter(l => l.trim()) : [];
  // Failed commands: show all lines expanded; success: preview first 4
  const preview   = failed ? lines : lines.slice(0, 4);
  const rest      = failed ? [] : lines.slice(4);

  return (
    <div className={`rounded-lg border text-xs overflow-hidden my-1 ${
      failed    ? "border-red-500/50 bg-red-950/30" :
      isRunning ? "border-zinc-800 bg-black/70" :
                  "border-zinc-800 bg-black/70"
    }`}>
      {/* Command line */}
      <div className={`flex items-center gap-2 px-3 py-2 font-mono ${failed ? "bg-red-900/20" : ""}`}>
        <span className="shrink-0">
          {isRunning
            ? <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
            : ok
              ? <CheckCircle2 className="w-3 h-3 text-green-400" />
              : <XCircle className="w-3 h-3 text-red-400" />}
        </span>
        <span className="text-zinc-500 shrink-0">$</span>
        <span className={`flex-1 min-w-0 truncate ${failed ? "text-red-200" : "text-zinc-200"}`}>{msg.cmd}</span>
        {!isRunning && (
          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-bold ${ok ? "text-green-500" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}>
            {ok ? "ok" : `exit ${msg.exitCode}`}
          </span>
        )}
      </div>
      {/* Output lines */}
      {preview.length > 0 && (
        <div className={`border-t px-3 py-2 space-y-0.5 ${failed ? "border-red-500/20" : "border-zinc-800/60"}`}>
          {preview.map((l, i) => (
            <div key={i} className={`font-mono text-[11px] leading-relaxed break-all ${failed ? "text-red-300" : "text-zinc-400"}`}>
              {l}
            </div>
          ))}
          {rest.length > 0 && (
            <button onClick={onToggle}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 mt-1 flex items-center gap-1">
              {msg.open
                ? <><ChevronDown className="w-3 h-3" /> collapse</>
                : <><ChevronRight className="w-3 h-3" /> +{rest.length} more lines</>}
            </button>
          )}
          {msg.open && rest.length > 0 && (
            <pre className="font-mono text-[11px] text-zinc-400 whitespace-pre-wrap max-h-56 overflow-y-auto border-t border-zinc-800 pt-2 mt-1">
              {rest.join("\n")}
            </pre>
          )}
        </div>
      )}
      {isRunning && lines.length === 0 && (
        <div className="border-t border-zinc-800/60 px-3 py-1.5 text-zinc-600 text-[11px] font-mono">
          running…
        </div>
      )}
    </div>
  );
}

// ─── Main Servers Page ────────────────────────────────────────────────────────

export default function ServersList() {
  const { data: servers = [], isLoading } = useListServers() as { data: ServerRow[]; isLoading: boolean };
  const qc = useQueryClient();

  const [addOpen, setAddOpen]         = useState(false);
  const [agentServer, setAgentServer] = useState<ServerRow | null>(null);
  const [termServer, setTermServer]   = useState<ServerRow | null>(null);
  const [testing, setTesting]         = useState<number | null>(null);
  const [deleting, setDeleting]       = useState<number | null>(null);

  const [form, setForm] = useState({
    name: "", host: "", port: "22", username: "root",
    authType: "key" as "key" | "password",
    privateKey: "", password: "", provider: "custom", location: "custom",
    githubToken: "",
  });
  const [saving, setSaving] = useState(false);

  const addServer = async () => {
    if (!form.name || !form.host || !form.username) { toast.error("Name, host, and username are required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, host: form.host, port: parseInt(form.port) || 22,
          username: form.username, authType: form.authType,
          privateKey: form.authType === "key" ? form.privateKey : undefined,
          password: form.authType === "password" ? form.password : undefined,
          provider: form.provider, location: form.location,
          githubToken: form.githubToken || undefined,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success("Server added");
      setAddOpen(false);
      setForm({ name: "", host: "", port: "22", username: "root", authType: "key", privateKey: "", password: "", provider: "custom", location: "custom", githubToken: "" });
      qc.invalidateQueries({ queryKey: ["listServers"] });
    } catch (e: unknown) { toast.error(String(e instanceof Error ? e.message : e)); }
    finally { setSaving(false); }
  };

  const deleteServer = async (id: number, name: string) => {
    if (!confirm(`Delete server "${name}"?`)) return;
    setDeleting(id);
    try {
      await fetch(`${BASE}/api/servers/${id}`, { method: "DELETE" });
      toast.success("Server removed");
      qc.invalidateQueries({ queryKey: ["listServers"] });
    } finally { setDeleting(null); }
  };

  const testConnection = async (s: ServerRow) => {
    setTesting(s.id);
    try {
      const res = await fetch(`${BASE}/api/servers/${s.id}/test`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Connected: ${data.output?.split("\n")[0] ?? "OK"}`);
        qc.invalidateQueries({ queryKey: ["listServers"] });
      } else {
        toast.error(`Connection failed: ${data.error}`);
        qc.invalidateQueries({ queryKey: ["listServers"] });
      }
    } catch (e: unknown) { toast.error(String(e instanceof Error ? e.message : e)); }
    finally { setTesting(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Servers</h1>
          <p className="text-sm text-muted-foreground">SSH into your servers and run AI-powered tasks</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Server
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 opacity-40" />Loading servers…
        </div>
      ) : (servers as ServerRow[]).length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl space-y-3">
          <Server className="w-12 h-12 text-muted-foreground mx-auto opacity-40" />
          <h3 className="text-lg font-medium">No servers yet</h3>
          <p className="text-sm text-muted-foreground">Add a server to start running AI-powered tasks.</p>
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add your first server
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(servers as ServerRow[]).map((s) => (
            <Card key={s.id} className="bg-card/60 border-border hover:border-primary/40 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2 min-w-0">
                    <Server className="w-5 h-5 text-primary shrink-0" />
                    <CardTitle className="text-base truncate">{s.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <StatusDot s={s.status} />
                    <Badge variant="outline" className={`text-[10px] py-0 ${statusBadge(s.status)}`}>{s.status}</Badge>
                  </div>
                </div>
                <div className="font-mono text-xs text-muted-foreground bg-black/40 rounded px-2 py-1.5 mt-2 flex items-center justify-between">
                  <span>{s.username}@{s.host}</span>
                  <span className="text-zinc-600">:{s.port}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    {s.authType === "key" ? <Key className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {s.authType === "key" ? "SSH Key" : "Password"}
                  </span>
                  <span>{s.provider} · {s.location}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" className="w-full text-xs" disabled={testing === s.id} onClick={() => testConnection(s)}>
                    {testing === s.id ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Wifi className="w-3 h-3 mr-1.5" />}
                    Test
                  </Button>
                  <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => setTermServer(s)}>
                    <Terminal className="w-3 h-3 mr-1.5" /> Terminal
                  </Button>
                </div>
                <Button size="sm" className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs" onClick={() => setAgentServer(s)}>
                  <Sparkles className="w-3 h-3 mr-1.5" /> AI Coding Agent
                </Button>
                <Button size="sm" variant="ghost" className="w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  disabled={deleting === s.id} onClick={() => deleteServer(s.id, s.name)}>
                  {deleting === s.id ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1.5" />}
                  Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Server Drawer */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>Add Server</SheetTitle></SheetHeader>
          <div className="space-y-4 py-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Server Name</Label>
                <Input placeholder="production-web-01" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Host / IP</Label>
                <Input placeholder="192.168.1.1" value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Port</Label>
                <Input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input placeholder="root" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Auth Type</Label>
                <div className="flex gap-2">
                  {(["key", "password"] as const).map(t => (
                    <Button key={t} size="sm" type="button" variant={form.authType === t ? "default" : "outline"} className="flex-1"
                      onClick={() => setForm(f => ({ ...f, authType: t }))}>
                      {t === "key" ? <Key className="w-3.5 h-3.5 mr-1.5" /> : <Lock className="w-3.5 h-3.5 mr-1.5" />}
                      {t === "key" ? "SSH Key" : "Password"}
                    </Button>
                  ))}
                </div>
              </div>
              {form.authType === "key" ? (
                <div className="col-span-2 space-y-1.5">
                  <Label>Private Key (PEM)</Label>
                  <Textarea className="font-mono text-xs h-40"
                    placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
                    value={form.privateKey} onChange={e => setForm(f => ({ ...f, privateKey: e.target.value }))} />
                </div>
              ) : (
                <div className="col-span-2 space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" placeholder="SSH password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Provider (optional)</Label>
                <Input placeholder="AWS / DigitalOcean" value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Location (optional)</Label>
                <Input placeholder="us-east-1" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>GitHub Token (optional)</Label>
                <Input type="password" placeholder="ghp_xxxxxxxxxxxx — for git push" value={form.githubToken} onChange={e => setForm(f => ({ ...f, githubToken: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Personal Access Token with repo write permission. Stored securely and used only for git push.</p>
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addServer} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Server
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {termServer  && <TerminalDialog server={termServer}  onClose={() => setTermServer(null)}  />}
      {agentServer && <CodingAgentDialog server={agentServer} onClose={() => setAgentServer(null)} />}
    </div>
  );
}

// ─── Terminal Dialog ──────────────────────────────────────────────────────────

function TerminalDialog({ server, onClose }: { server: ServerRow; onClose: () => void }) {
  const [cmd, setCmd]         = useState("");
  const [lines, setLines]     = useState<TerminalLine[]>([{ kind: "info", text: `Connected to ${server.username}@${server.host}:${server.port}` }]);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async () => {
    if (!cmd.trim() || running) return;
    const c = cmd.trim();
    setCmd("");
    setLines(l => [...l, { kind: "cmd", text: c }]);
    setRunning(true);
    try {
      const res = await fetch(`${BASE}/api/servers/${server.id}/exec`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: c }),
      });
      const data = await res.json();
      if (data.error) {
        setLines(l => [...l, { kind: "err", text: data.error }]);
      } else {
        if (data.stdout) data.stdout.split("\n").filter(Boolean).forEach((t: string) => setLines(l => [...l, { kind: "out", text: t }]));
        if (data.stderr) data.stderr.split("\n").filter(Boolean).forEach((t: string) => setLines(l => [...l, { kind: "err", text: t }]));
        if (data.code !== 0) setLines(l => [...l, { kind: "err", text: `Exit code: ${data.code}` }]);
      }
    } catch (e: unknown) {
      setLines(l => [...l, { kind: "err", text: String(e instanceof Error ? e.message : e) }]);
    } finally { setRunning(false); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [cmd, running, server.id]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-5 h-5 text-primary" />
          <span className="font-semibold">Terminal</span>
          <span className="font-mono text-sm text-muted-foreground">— {server.username}@{server.host}</span>
        </div>
        <TerminalView lines={lines} loading={running} />
        <div className="flex gap-2 mt-2">
          <div className="flex items-center text-muted-foreground font-mono text-sm px-2">$</div>
          <Input ref={inputRef} className="font-mono text-sm" placeholder="ls -la"
            value={cmd} onChange={e => setCmd(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") run(); }} disabled={running} autoFocus />
          <Button onClick={run} disabled={running || !cmd.trim()}>
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── AI Coding Agent Chat Dialog ──────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  economy:      "Fast",
  balanced:     "Smart",
  "high-power": "Max",
  kimi:         "Kimi",
  v4pro:        "V4 Pro",
  auto:         "Auto",
};
const MODE_DESCS: Record<string, string> = {
  economy:      "Gemini Flash — fastest, good for simple tasks",
  balanced:     "DeepSeek V3 — balanced speed and power",
  "high-power": "GPT-4o — most capable (OpenAI)",
  kimi:         "Kimi K2.6 — best planner & architect (NVIDIA NIM)",
  v4pro:        "DeepSeek V4 Pro — best builder for large codebases (NVIDIA NIM)",
  auto:         "Auto — Kimi plans → V4 Pro builds → GLM recovers (NVIDIA NIM)",
};

type AgentMode = "economy" | "balanced" | "high-power" | "kimi" | "v4pro" | "auto";

function CodingAgentDialog({ server, onClose }: { server: ServerRow; onClose: () => void }) {
  const mode: AgentMode         = "auto";
  const [input, setInput]       = useState("");
  const [running, setRunning]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pastedPrompt, setPastedPrompt] = useState<{ content: string; chars: number } | null>(null);
  const [failedCmds, setFailedCmds] = useState<{ cmd: string; desc: string; exitCode: number }[]>([]);
  // Live status: what the agent is doing RIGHT NOW
  const [liveOp, setLiveOp]     = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat display messages
  const [msgs, setMsgs]         = useState<ChatMsg[]>([]);
  // AI conversation history (clean role/content for backend)
  const [aiHistory, setAiHistory] = useState<AIMsg[]>([]);
  // Build history panel
  const [showHistory, setShowHistory]   = useState(false);
  const [taskHistory, setTaskHistory]   = useState<TaskHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const r = await fetch(`${BASE}/api/servers/${server.id}/history`);
      const data = await r.json() as TaskHistoryRow[];
      setTaskHistory(Array.isArray(data) ? data : []);
    } catch { /* ignore */ } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = () => {
    setShowHistory(true);
    void loadHistory();
  };

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const cmdCounter = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const addMsg = (m: ChatMsg) => setMsgs(prev => [...prev, m]);

  const updateCmdOutput = (globalIdx: number, chunk: string, exitCode?: number) => {
    setMsgs(prev => prev.map(m => {
      if (m.kind === "cmd" && m.index === globalIdx) {
        return { ...m, output: m.output + chunk, exitCode: exitCode ?? m.exitCode };
      }
      return m;
    }));
  };

  const toggleCmd = (globalIdx: number) => {
    setMsgs(prev => prev.map(m => {
      if (m.kind === "cmd" && m.index === globalIdx) return { ...m, open: !m.open };
      return m;
    }));
  };

  const sendMessage = async (overrideText?: string) => {
    const hasContent = overrideText || input.trim() || pastedPrompt;
    if (!hasContent || running) return;
    setFailedCmds([]);

    // Full content sent to AI — override takes priority, then pasted prompt + typed text
    const fullText = overrideText ?? (pastedPrompt
      ? pastedPrompt.content + (input.trim() ? `\n\n${input.trim()}` : "")
      : input.trim());

    // Short display shown in chat bubble
    const displayText = overrideText ?? (pastedPrompt
      ? `📄 Long prompt (${pastedPrompt.chars.toLocaleString()} chars)${input.trim() ? `\n\n${input.trim()}` : ""}`
      : fullText);

    if (!overrideText) { setInput(""); setPastedPrompt(null); }
    setRunning(true);

    // Add user message to display + AI history
    addMsg({ kind: "user", text: displayText });
    const newHistory: AIMsg[] = [...aiHistory, { role: "user", content: fullText }];
    setAiHistory(newHistory);

    // Build rich AI history for the next conversation turn
    // Includes command outputs so the AI has full context on follow-up messages
    const agentTurnParts: string[] = [];

    try {
      const res = await fetch(`${BASE}/api/servers/${server.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newHistory, mode }),
      });
      // Non-200 = plain JSON error (returned before SSE headers are set)
      if (!res.ok) {
        let errMsg = `Server error ${res.status}`;
        try { const j = await res.json() as { error?: string }; if (j.error) errMsg = j.error; } catch { /* ignore */ }
        throw new Error(errMsg);
      }
      if (!res.body) throw new Error("No response body from server");

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   buf    = "";

      // map: localCmdIndex (per-run, resets each iteration) → globalCmdIndex (unique across session)
      // Backend resets local indices each "run" action, so we track by iteration+localIdx
      let   iterOffset = 0;
      const localToGlobal = new Map<string, number>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          let ev: Record<string, unknown>;
          try { ev = JSON.parse(line); } catch { continue; }

          const type = ev.type as string;

          if (type === "think") {
            const text = ev.text as string ?? "";
            addMsg({ kind: "think", text });
            agentTurnParts.push(`[thinking] ${text}`);

          } else if (type === "browser_start") {
            setLiveOp(`Opening browser (${ev.stepCount} steps)…`);

          } else if (type === "browser_shot") {
            const index = ev.index as number;
            const label = ev.label as string ?? "Screenshot";
            const data  = ev.data  as string ?? "";
            setLiveOp(`Browser: ${label}`);
            addMsg({ kind: "browser_shot", index, label, data });
            agentTurnParts.push(`[browser screenshot] ${label}`);

          } else if (type === "browser_text") {
            const index = ev.index as number;
            const text  = ev.text  as string ?? "";
            addMsg({ kind: "browser_text", index, text });
            agentTurnParts.push(`[browser page text] ${text.slice(0, 200)}`);

          } else if (type === "browser_err") {
            const index = ev.index as number;
            const btype = ev.type  as string ?? "";
            const error = ev.error as string ?? "";
            addMsg({ kind: "browser_err", index, type: btype, error });
            agentTurnParts.push(`[browser error] ${btype}: ${error}`);

          } else if (type === "browser_done") {
            setLiveOp("");

          } else if (type === "cmd_start") {
            const localIdx  = ev.index as number;
            const globalIdx = cmdCounter.current++;
            const key       = `${iterOffset}:${localIdx}`;
            localToGlobal.set(key, globalIdx);
            const cmd  = ev.cmd  as string ?? "";
            const desc = ev.desc as string ?? "";
            setLiveOp(desc || cmd.slice(0, 60));
            addMsg({ kind: "cmd", index: globalIdx, cmd, desc, output: "", open: true });

          } else if (type === "cmd_output") {
            const localIdx  = ev.index as number;
            const globalIdx = localToGlobal.get(`${iterOffset}:${localIdx}`) ?? -1;
            const chunk     = ev.chunk as string ?? "";
            if (globalIdx >= 0) updateCmdOutput(globalIdx, chunk);

          } else if (type === "cmd_done") {
            const localIdx  = ev.index as number;
            const globalIdx = localToGlobal.get(`${iterOffset}:${localIdx}`) ?? -1;
            const code      = ev.code as number ?? 0;
            if (globalIdx >= 0) updateCmdOutput(globalIdx, "", code);
            // Track failed commands so we can surface them prominently
            if (code !== 0 && globalIdx >= 0) {
              setMsgs(prev => {
                const m = prev.find(x => x.kind === "cmd" && x.index === globalIdx) as Extract<ChatMsg, { kind: "cmd" }> | undefined;
                if (m) setFailedCmds(f => [...f, { cmd: m.cmd, desc: m.desc, exitCode: code }]);
                return prev;
              });
            }
            setLiveOp("");

          } else if (type === "cmd_results") {
            const text = ev.text as string ?? "";
            agentTurnParts.push(`[commands executed + output]\n${text}`);
            iterOffset++;

          } else if (type === "reply" || type === "done") {
            const text = ev.text as string ?? "";
            addMsg({ kind: type === "done" ? "done" : "reply", text });
            agentTurnParts.push(`[agent message] ${text}`);
            setLiveOp("");

          } else if (type === "tokens") {
            addMsg({
              kind: "tokens",
              prompt: ev.prompt as number ?? 0,
              completion: ev.completion as number ?? 0,
              total: ev.total as number ?? 0,
              iters: ev.iters as number ?? 0,
              model: ev.model as string ?? "",
              durationMs: ev.durationMs as number ?? 0,
            });
            agentTurnParts.push(`[tokens] ${ev.total} total / ${ev.iters} steps / ${((ev.durationMs as number) / 1000).toFixed(1)}s`);

          } else if (type === "error") {
            const text = ev.text as string ?? "Unknown error";
            addMsg({ kind: "error", text });
            agentTurnParts.push(`[error] ${text}`);
          }
        }
      }

      // Store full agent turn (with all command outputs) in AI history
      // Truncate to stay within backend max(20000) — keeps last ~15000 chars of context
      if (agentTurnParts.length) {
        let assistantContent = agentTurnParts.join("\n\n");
        if (assistantContent.length > 15000) {
          assistantContent = "[...earlier output truncated...]\n\n" + assistantContent.slice(-13000);
        }
        setAiHistory(h => [...h, { role: "assistant", content: assistantContent }]);
      }
    } catch (e: unknown) {
      addMsg({ kind: "error", text: String(e instanceof Error ? e.message : e) });
    } finally {
      setRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const diagnoseAndContinue = () => {
    const failureList = failedCmds
      .map(f => `  • exit ${f.exitCode}: ${f.desc || f.cmd.slice(0, 80)}`)
      .join("\n");
    sendMessage(
      `The following commands failed:\n${failureList}\n\n` +
      `Diagnose the root cause of each failure. Read the error output shown above. ` +
      `Fix only the root cause. Then continue building from exactly where you left off. ` +
      `Do not restart, do not rebuild from scratch, do not repeat work that already succeeded.`
    );
  };

  const clearChat = () => {
    setMsgs([]); setAiHistory([]); cmdCounter.current = 0; setLiveOp("");
  };

  const handleZipUpload = async (file: File) => {
    if (!file.name.endsWith(".zip")) { toast.error("Only .zip files are supported"); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BASE}/api/servers/${server.id}/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }

      const { zipName, fileCount, files } = data as {
        zipName: string; fileCount: number;
        files: { path: string; content: string; size: number; isImage?: boolean }[];
      };

      const fileList = files.map(f => `  • ${f.path} (${(f.size / 1024).toFixed(1)}KB)`).join("\n");
      const fileContents = files
        .filter(f => !f.isImage && f.content !== "[binary file]")
        .map(f => `=== ${f.path} ===\n${f.content}`)
        .join("\n\n---\n\n");

      const zipMsg = `📦 Uploaded ZIP: ${zipName} (${fileCount} files)\n${fileList}\n\n${fileContents.slice(0, 12000)}`;

      addMsg({ kind: "user", text: `📦 Uploaded: ${zipName} (${fileCount} files)\n${fileList}` });
      const newHistory: AIMsg[] = [...aiHistory, { role: "user", content: zipMsg }];
      setAiHistory(newHistory);
      setInput(`Push these files to the server — deploy to the correct domain, verify PHP syntax and HTTP 200`);
      toast.success(`${fileCount} files extracted from ${zipName}`);
    } catch (e: unknown) {
      toast.error(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className="max-w-3xl w-full h-[100dvh] sm:h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-none sm:rounded-lg"
        style={{ maxHeight: "100dvh" }}
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-card/80 shrink-0">
          <div className="w-7 h-7 rounded-full bg-purple-600/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm flex items-center gap-1.5 leading-none">
              Xdigitex AI
              <StatusDot s={server.status} />
            </div>
            <div className="text-[10px] truncate mt-0.5">
              {running ? (
                <span className="text-purple-400 flex items-center gap-1 min-w-0">
                  <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0" />
                  <span className="truncate">{liveOp ? liveOp : "Thinking…"}</span>
                </span>
              ) : (
                <span className="text-muted-foreground font-mono truncate">{server.username}@{server.host}</span>
              )}
            </div>
          </div>
          {/* Mode badge — always Auto */}
          <div className="shrink-0"
               title={MODE_DESCS["auto"]}>
            <span className="px-2 py-1 rounded text-[10px] font-semibold bg-gradient-to-r from-violet-600 to-blue-500 text-white select-none">
              ✦ Auto
            </span>
          </div>
          <Button size="sm" variant="ghost" onClick={openHistory} title="History" className="h-7 w-7 p-0 shrink-0">
            <History className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={clearChat} title="Clear" className="h-7 w-7 p-0 shrink-0">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {msgs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
              <div className="w-16 h-16 rounded-full bg-purple-600/15 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">XDIGITEX Coding Agent</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Tell me what to fix, build, or diagnose. I'll SSH into your server, investigate, and work until it's done.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-sm text-xs">
                {[
                  { label: "🔍 Fix orders stuck at pending", val: "Fix orders stuck at pending in malabora.site" },
                  { label: "🚨 Diagnose 500 errors on my site", val: "Diagnose why my site is returning 500 errors" },
                  { label: "🪵 Check and inspect error logs", val: "Check and show me the error logs" },
                  { label: "🔑 Generate SSH key for this server", val: "Generate an SSH key pair for this server so I can connect without a password" },
                ].map(s => (
                  <button key={s.val} onClick={() => setInput(s.val)}
                    className="text-left px-3 py-2 rounded-lg border border-border bg-card/40 hover:border-purple-500/40 hover:bg-purple-500/5 transition-colors text-muted-foreground">
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, i) => {
            if (m.kind === "user") return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] bg-purple-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
                  {m.text}
                </div>
              </div>
            );

            if (m.kind === "think") {
              const t = m.text.toLowerCase();
              const icon =
                t.includes("found") || t.includes("located") || t.includes("at /") ? "✅" :
                t.includes("fix") || t.includes("updat") || t.includes("replac") || t.includes("sed") || t.includes("writ") ? "🔧" :
                t.includes("bug") || t.includes("error") || t.includes("issue") || t.includes("empty") || t.includes("fail") ? "🐛" :
                t.includes("verif") || t.includes("test") || t.includes("check") || t.includes("confirm") ? "⚡" :
                t.includes("read") || t.includes("cat ") || t.includes("content") ? "📖" :
                t.includes("ssh") || t.includes("key") || t.includes("generat") ? "🔑" :
                t.includes("log") || t.includes("error_log") ? "🪵" :
                "🔍";
              return (
                <div key={i} className="flex items-start gap-3 px-1 py-0.5">
                  <span className="text-base shrink-0 leading-snug mt-0.5">{icon}</span>
                  <p className="text-sm text-zinc-300 leading-relaxed flex-1">{m.text}</p>
                </div>
              );
            }

            if (m.kind === "browser_shot") return (
              <div key={i} className="ml-2 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="text-base">🌐</span>
                  <span className="font-medium">{m.label}</span>
                </div>
                <img
                  src={`data:image/png;base64,${m.data}`}
                  alt={m.label}
                  className="rounded-lg border border-zinc-700 max-w-full shadow-lg"
                  style={{ maxHeight: 420, objectFit: "contain" }}
                />
              </div>
            );

            if (m.kind === "browser_text") return (
              <div key={i} className="ml-2 text-xs text-zinc-400 bg-zinc-900/60 rounded-lg px-3 py-2 border border-zinc-800 max-w-[90%]">
                <span className="text-zinc-500 mr-1">📄 Page text:</span>
                <span className="whitespace-pre-wrap">{m.text.slice(0, 400)}{m.text.length > 400 ? "…" : ""}</span>
              </div>
            );

            if (m.kind === "browser_err") return (
              <div key={i} className="ml-2 text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2 border border-red-800/40">
                <span className="font-mono">🌐 {m.type} failed: {m.error}</span>
              </div>
            );

            if (m.kind === "cmd") return (
              <div key={i} className="ml-8">
                <CmdBlock msg={m} onToggle={() => toggleCmd(m.index)} />
              </div>
            );

            if (m.kind === "reply" || m.kind === "done") {
              // For done messages, find the last browser screenshot in this same turn
              const lastShot = m.kind === "done"
                ? (() => {
                    for (let j = i - 1; j >= 0; j--) {
                      if (msgs[j].kind === "user") break;
                      if (msgs[j].kind === "browser_shot") return msgs[j] as { kind: "browser_shot"; label: string; data: string };
                    }
                    return null;
                  })()
                : null;

              // Parse [DOWNLOAD:/path/to/file:filename.ext] markers in done messages
              const renderText = (text: string) => {
                const MARKER = /\[DOWNLOAD:([^\]:]+):([^\]]+)\]/g;
                const parts: React.ReactNode[] = [];
                let last = 0; let k = 0; let match: RegExpExecArray | null;
                while ((match = MARKER.exec(text)) !== null) {
                  if (match.index > last) parts.push(<span key={k++} className="whitespace-pre-wrap">{text.slice(last, match.index)}</span>);
                  const [, filePath, fileName] = match;
                  parts.push(
                    <a key={k++}
                      href={`${BASE}/api/servers/${server.id}/sftp-download?path=${encodeURIComponent(filePath)}`}
                      download={fileName}
                      className="inline-flex items-center gap-1.5 mt-2 mr-2 px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 hover:bg-blue-500/30 transition-colors text-xs font-semibold no-underline cursor-pointer"
                    >
                      {fileName}
                    </a>
                  );
                  last = match.index + match[0].length;
                }
                if (last < text.length) parts.push(<span key={k++} className="whitespace-pre-wrap">{text.slice(last)}</span>);
                return parts;
              };

              return (
                <div key={i} className="flex items-start gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    m.kind === "done" ? "bg-green-600/20" : "bg-purple-600/20"
                  }`}>
                    {m.kind === "done"
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                      : <Sparkles className="w-3 h-3 text-purple-400" />
                    }
                  </div>
                  <div className={`max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm ${
                    m.kind === "done"
                      ? "bg-green-500/10 border border-green-500/20 text-green-300"
                      : "bg-card border border-border text-foreground"
                  }`}>
                    {renderText(m.text)}
                    {lastShot && (
                      <div className="mt-3 border border-green-500/20 rounded-xl overflow-hidden">
                        <div className="px-2 py-1 bg-green-500/10 text-[10px] text-green-400/70 font-mono">{lastShot.label}</div>
                        <img
                          src={`data:image/jpeg;base64,${lastShot.data}`}
                          alt={lastShot.label}
                          className="w-full block"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            if (m.kind === "error") return (
              <div key={i} className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-red-600/20 flex items-center justify-center shrink-0 mt-0.5">
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                </div>
                <div className="max-w-[85%] bg-red-500/10 border border-red-500/20 text-red-300 rounded-2xl rounded-tl-sm px-4 py-3 text-sm">
                  {m.text}
                </div>
              </div>
            );

            if (m.kind === "tokens") return (
              <div key={i} className="flex justify-center py-1">
                <div className="flex items-center gap-2 text-[10px] text-zinc-500 bg-zinc-900/60 border border-zinc-800 rounded-full px-3 py-1">
                  <Zap className="w-2.5 h-2.5 text-yellow-500/70 shrink-0" />
                  <span>{m.iters} steps</span>
                  <span className="text-zinc-700">·</span>
                  <span>{m.prompt.toLocaleString()} in</span>
                  <span className="text-zinc-700">·</span>
                  <span>{m.completion.toLocaleString()} out</span>
                  <span className="text-zinc-700">·</span>
                  <span className="font-medium text-zinc-400">{m.total.toLocaleString()} tokens</span>
                  <span className="text-zinc-700">·</span>
                  <Clock className="w-2.5 h-2.5 text-zinc-600 shrink-0" />
                  <span>{(m.durationMs / 1000).toFixed(1)}s</span>
                </div>
              </div>
            );

            return null;
          })}

          {running && msgs[msgs.length - 1]?.kind === "user" && (
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-purple-600/20 flex items-center justify-center shrink-0">
                <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-muted-foreground">
                {aiHistory.length > 1 ? "Working…" : "Connecting to server…"}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className={`shrink-0 border-t bg-card/60 px-4 py-3 transition-colors ${
          !running && msgs.length > 0 ? "border-purple-500/30" : "border-border"
        }`}>
          {!running && msgs.length > 0 && (
            <div className="mb-2 text-[11px] text-purple-400 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              Conversation is live — reply to continue, ask for more, or say "now fix it"
            </div>
          )}
          {/* Quick action chips */}
          {!running && msgs.length > 0 && (() => {
            const lastDone = [...msgs].reverse().find(m => m.kind === "done");
            const phaseMatch = lastDone?.text.match(/[Pp]hase\s*(\d+)/);
            const nextPhase = phaseMatch ? parseInt(phaseMatch[1]) + 1 : null;
            // detect if the last agent turn ended without a "done" message (stopped mid-task)
            const lastMsgKind = msgs[msgs.length - 1]?.kind;
            const stoppedMidTask = lastMsgKind === "think" || lastMsgKind === "cmd" || lastMsgKind === "reply";
            return (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {/* Always show Continue if it looks like the agent stopped mid-task */}
                {stoppedMidTask && (
                  <button
                    onClick={() => sendMessage("Continue from where you left off. Resume building — do not restart or repeat completed work.")}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-500/20 border border-purple-500/40 text-purple-300 hover:bg-purple-500/30 hover:border-purple-400/60 transition-colors text-[11px] font-semibold"
                  >
                    ▶ Continue
                  </button>
                )}
                {nextPhase && nextPhase <= 10 && (
                  <button
                    onClick={() => sendMessage(`Continue to Phase ${nextPhase}`)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 hover:border-purple-400/50 transition-colors text-[11px] font-semibold"
                  >
                    ▶ Phase {nextPhase}
                  </button>
                )}
                <button
                  onClick={() => sendMessage("Create a ZIP backup of the entire project site files and give me a download link.")}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800/80 border border-zinc-700 text-zinc-300 hover:border-blue-500/40 hover:text-blue-300 transition-colors text-[11px] font-medium"
                >
                  📦 ZIP
                </button>
                <button
                  onClick={() => sendMessage("Dump the database to a .sql file in /tmp/ and give me a download link.")}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800/80 border border-zinc-700 text-zinc-300 hover:border-blue-500/40 hover:text-blue-300 transition-colors text-[11px] font-medium"
                >
                  🗄 SQL
                </button>
              </div>
            );
          })()}
          {/* Failed commands sticky banner — shown after run completes if errors occurred */}
          {!running && failedCmds.length > 0 && (
            <div className="mb-2 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 text-red-400 font-semibold mb-1">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                {failedCmds.length} command{failedCmds.length > 1 ? "s" : ""} failed — scroll up to see details
              </div>
              <div className="space-y-0.5 mb-2">
                {failedCmds.map((f, i) => (
                  <div key={i} className="font-mono text-red-300/80 truncate">
                    <span className="text-red-500/60 mr-1">exit {f.exitCode}</span>
                    {f.desc || f.cmd.slice(0, 80)}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={diagnoseAndContinue}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-500/20 border border-orange-500/40 text-orange-300 hover:bg-orange-500/30 hover:text-orange-200 transition-colors font-semibold text-[11px]"
                >
                  <RotateCcw className="w-3 h-3" />
                  Diagnose &amp; Continue
                </button>
                <button
                  onClick={() => setFailedCmds([])}
                  className="text-[10px] text-red-500/50 hover:text-red-400 transition-colors"
                >dismiss</button>
              </div>
            </div>
          )}
          {/* Pasted long-prompt chip */}
          {pastedPrompt && (
            <div className="mb-2 flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-1.5 text-xs text-purple-300">
              <FileText className="w-3.5 h-3.5 shrink-0 text-purple-400" />
              <span className="flex-1 font-mono">prompt.txt — {pastedPrompt.chars.toLocaleString()} chars</span>
              <button
                onClick={() => setPastedPrompt(null)}
                className="text-purple-400/60 hover:text-purple-200 transition-colors leading-none"
                title="Remove"
              >✕</button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            {/* Hidden file input for zip upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleZipUpload(f); }}
            />
            {/* Zip upload button */}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-11 w-10 p-0 shrink-0 text-zinc-400 hover:text-purple-400 hover:bg-purple-500/10"
              disabled={running || uploading}
              onClick={() => fileInputRef.current?.click()}
              title="Upload ZIP file — AI will read, modify and deploy files to server"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            </Button>
            <Textarea
              ref={inputRef}
              className={`flex-1 resize-none text-sm min-h-[44px] max-h-36 bg-background transition-colors ${
                !running && msgs.length > 0 ? "border-purple-500/40 focus:border-purple-400" : ""
              }`}
              placeholder={
                running ? "Agent is working…" :
                pastedPrompt ? "Add extra instructions (optional)…" :
                msgs.length > 0 ? "Reply, ask a follow-up, or say 'continue'…" :
                "Ask me to fix, build, or diagnose anything… (📎 upload a ZIP to deploy files)"
              }
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              onPaste={e => {
                const text = e.clipboardData.getData("text");
                if (text.length > 1500) {
                  e.preventDefault();
                  setPastedPrompt({ content: text, chars: text.length });
                }
              }}
              disabled={running}
              rows={1}
            />
            <Button
              className="h-11 px-4 bg-purple-600 hover:bg-purple-500 shrink-0"
              disabled={running || (!input.trim() && !pastedPrompt)}
              onClick={sendMessage}
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <div className="mt-1.5 text-[10px] text-zinc-600 text-center">
            {MODE_DESCS[mode]}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* ── Build History Sheet ── */}
    <Sheet open={showHistory} onOpenChange={setShowHistory}>
      <SheetContent side="right" className="w-[420px] sm:w-[520px] flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4 text-purple-400" />
            Build History — {server.name}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {historyLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…
            </div>
          ) : taskHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground text-sm gap-2">
              <History className="w-8 h-8 opacity-30" />
              No tasks run yet on this server.
            </div>
          ) : (
            <div className="space-y-3">
              {taskHistory.map(h => (
                <div key={h.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground line-clamp-2">{h.task}</p>
                      {h.summary && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{h.summary}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-500 shrink-0 mt-0.5">
                      {new Date(h.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-purple-600/15 text-purple-400 font-mono">
                      {h.model ? (h.model.includes("high-power") || h.model.includes("gpt") ? "Max" : h.model.includes("balanced") || h.model.includes("deepseek") ? "Smart" : "Fast") : "AI"}
                    </span>
                    <span className="flex items-center gap-1 text-zinc-500">
                      <Zap className="w-2.5 h-2.5 text-yellow-500/70" />
                      {h.totalTokens.toLocaleString()} tokens
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-500">{h.iterations} steps</span>
                    <span className="text-zinc-600">·</span>
                    <span className="flex items-center gap-0.5 text-zinc-500">
                      <Clock className="w-2.5 h-2.5" />
                      {(h.durationMs / 1000).toFixed(1)}s
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-600">{h.promptTokens.toLocaleString()} in / {h.completionTokens.toLocaleString()} out</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <SheetFooter className="px-5 py-3 border-t border-border shrink-0">
          <Button size="sm" variant="outline" onClick={loadHistory} disabled={historyLoading} className="w-full">
            {historyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <RotateCcw className="w-3.5 h-3.5 mr-2" />}
            Refresh
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    </>
  );
}
