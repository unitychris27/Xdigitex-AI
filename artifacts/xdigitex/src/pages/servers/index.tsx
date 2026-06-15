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
  ChevronDown, ChevronRight, RotateCcw, X,
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
  | { kind: "error";        text: string };

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
  const lines     = msg.output ? msg.output.split("\n").filter(l => l.trim()) : [];
  const preview   = lines.slice(0, 4);
  const rest      = lines.slice(4);

  return (
    <div className="rounded-lg border border-zinc-800 bg-black/70 text-xs overflow-hidden my-1">
      {/* Command line */}
      <div className="flex items-center gap-2 px-3 py-2 font-mono">
        <span className="shrink-0">
          {isRunning
            ? <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
            : ok
              ? <CheckCircle2 className="w-3 h-3 text-green-400" />
              : <XCircle className="w-3 h-3 text-red-400" />}
        </span>
        <span className="text-zinc-500 shrink-0">$</span>
        <span className="text-zinc-200 flex-1 min-w-0 truncate">{msg.cmd}</span>
        {!isRunning && (
          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${ok ? "text-green-500" : "text-red-400"}`}>
            {ok ? "ok" : `exit ${msg.exitCode}`}
          </span>
        )}
      </div>
      {/* Preview lines — always shown */}
      {preview.length > 0 && (
        <div className="border-t border-zinc-800/60 px-3 py-2 space-y-0.5">
          {preview.map((l, i) => (
            <div key={i} className="font-mono text-[11px] text-zinc-400 leading-relaxed break-all">
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
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success("Server added");
      setAddOpen(false);
      setForm({ name: "", host: "", port: "22", username: "root", authType: "key", privateKey: "", password: "", provider: "custom", location: "custom" });
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

const MODE_LABELS: Record<string, string> = { economy: "⚡ Fast", balanced: "🧠 Smart", "high-power": "🚀 Max" };
const MODE_DESCS:  Record<string, string> = { economy: "Fastest — good for simple tasks", balanced: "Balanced speed and power", "high-power": "Most capable — best for complex builds" };

function CodingAgentDialog({ server, onClose }: { server: ServerRow; onClose: () => void }) {
  const [mode, setMode]         = useState<"economy" | "balanced" | "high-power">("high-power");
  const [input, setInput]       = useState("");
  const [running, setRunning]   = useState(false);
  // Live status: what the agent is doing RIGHT NOW
  const [liveOp, setLiveOp]     = useState<string>("");

  // Chat display messages
  const [msgs, setMsgs]         = useState<ChatMsg[]>([]);
  // AI conversation history (clean role/content for backend)
  const [aiHistory, setAiHistory] = useState<AIMsg[]>([]);

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

  const sendMessage = async () => {
    if (!input.trim() || running) return;
    const userText = input.trim();
    setInput("");
    setRunning(true);

    // Add user message to display + AI history
    addMsg({ kind: "user", text: userText });
    const newHistory: AIMsg[] = [...aiHistory, { role: "user", content: userText }];
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
      if (!res.body) throw new Error("No stream");

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

          } else if (type === "error") {
            const text = ev.text as string ?? "Unknown error";
            addMsg({ kind: "error", text });
            agentTurnParts.push(`[error] ${text}`);
          }
        }
      }

      // Store full agent turn (with all command outputs) in AI history
      // This ensures follow-up messages have full context of what was done
      if (agentTurnParts.length) {
        setAiHistory(h => [...h, { role: "assistant", content: agentTurnParts.join("\n\n") }]);
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

  const clearChat = () => {
    setMsgs([]); setAiHistory([]); cmdCounter.current = 0; setLiveOp("");
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-purple-600/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm flex items-center gap-2">
                XDIGITEX Coding Agent
                <StatusDot s={server.status} />
                <span className="text-xs font-normal text-muted-foreground font-mono">{server.username}@{server.host}</span>
              </div>
              <div className="text-[11px] truncate">
                {running ? (
                  <span className="text-purple-400 flex items-center gap-1.5 min-w-0">
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    <span className="truncate">{liveOp ? liveOp : "Thinking…"}</span>
                  </span>
                ) : msgs.length > 0 ? (
                  <span className="text-green-400 flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
                    Ready — type your next message ↓
                  </span>
                ) : (
                  <span className="text-muted-foreground">Ready — ask me to fix, build, or diagnose anything</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Mode selector */}
            <div className="flex gap-1">
              {(["economy", "balanced", "high-power"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  title={MODE_DESCS[m]}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    mode === m ? "bg-purple-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}>
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={clearChat} title="Clear chat" className="h-7 w-7 p-0">
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </div>
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

            if (m.kind === "reply" || m.kind === "done") return (
              <div key={i} className="flex items-start gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  m.kind === "done" ? "bg-green-600/20" : "bg-purple-600/20"
                }`}>
                  {m.kind === "done"
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    : <Sparkles className="w-3 h-3 text-purple-400" />
                  }
                </div>
                <div className={`max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm whitespace-pre-wrap ${
                  m.kind === "done"
                    ? "bg-green-500/10 border border-green-500/20 text-green-300"
                    : "bg-card border border-border text-foreground"
                }`}>
                  {m.text}
                </div>
              </div>
            );

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

            return null;
          })}

          {running && msgs[msgs.length - 1]?.kind === "user" && (
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-purple-600/20 flex items-center justify-center shrink-0">
                <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-muted-foreground">
                Connecting to server…
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
          <div className="flex gap-2 items-end">
            <Textarea
              ref={inputRef}
              className={`flex-1 resize-none text-sm min-h-[44px] max-h-36 bg-background transition-colors ${
                !running && msgs.length > 0 ? "border-purple-500/40 focus:border-purple-400" : ""
              }`}
              placeholder={
                running ? "Agent is working…" :
                msgs.length > 0 ? "Reply, ask a follow-up, or say 'now fix it'…" :
                "Ask me to fix, build, or diagnose anything… (Enter to send)"
              }
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={running}
              rows={1}
            />
            <Button
              className="h-11 px-4 bg-purple-600 hover:bg-purple-500 shrink-0"
              disabled={running || !input.trim()}
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
  );
}
