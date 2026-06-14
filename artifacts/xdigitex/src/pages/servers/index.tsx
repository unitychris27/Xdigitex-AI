import { useState, useRef, useEffect, useCallback } from "react";
import { useListServers } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Server, Plus, Terminal, Bot, Wifi, WifiOff, Loader2,
  Play, Trash2, RefreshCw, CheckCircle2, XCircle, ChevronRight,
  Key, Lock, Cpu, HardDrive, Activity,
} from "lucide-react";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServerRow {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "key" | "password";
  provider: string;
  location: string;
  status: "online" | "offline" | "error" | "connecting";
  createdAt: string;
}

interface AgentStep { index: number; cmd: string; desc: string; }
interface AgentPlan { commands: AgentStep[]; }

type TerminalLine =
  | { kind: "cmd"; text: string }
  | { kind: "out"; text: string }
  | { kind: "err"; text: string }
  | { kind: "info"; text: string }
  | { kind: "ok"; text: string };

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusColor(s: string) {
  if (s === "online")     return "bg-green-500/10 text-green-400 border-green-500/20";
  if (s === "error")      return "bg-red-500/10 text-red-400 border-red-500/20";
  if (s === "connecting") return "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse";
  return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
}
function StatusDot({ s }: { s: string }) {
  const c = s === "online" ? "bg-green-400" : s === "error" ? "bg-red-400" : s === "connecting" ? "bg-blue-400 animate-pulse" : "bg-zinc-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${c}`} />;
}

// ─── Terminal display ─────────────────────────────────────────────────────────

function TerminalView({ lines, loading }: { lines: TerminalLine[]; loading?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [lines]);
  return (
    <div ref={ref} className="bg-black/90 rounded-lg border border-zinc-800 font-mono text-xs p-4 h-72 overflow-y-auto space-y-0.5 select-text">
      {lines.length === 0 && !loading && (
        <span className="text-zinc-600">No output yet.</span>
      )}
      {lines.map((l, i) => (
        <div key={i} className={
          l.kind === "cmd"  ? "text-purple-400" :
          l.kind === "err"  ? "text-red-400" :
          l.kind === "info" ? "text-blue-400" :
          l.kind === "ok"   ? "text-green-400" :
          "text-zinc-200"
        }>
          {l.kind === "cmd" && <span className="text-zinc-500 mr-1">$</span>}
          {l.text}
        </div>
      ))}
      {loading && (
        <div className="flex items-center gap-1.5 text-zinc-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>running…</span>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ServersList() {
  const { data: servers = [], isLoading } = useListServers() as { data: ServerRow[]; isLoading: boolean };
  const qc = useQueryClient();

  const [addOpen, setAddOpen]         = useState(false);
  const [agentServer, setAgentServer] = useState<ServerRow | null>(null);
  const [termServer, setTermServer]   = useState<ServerRow | null>(null);
  const [testing, setTesting]         = useState<number | null>(null);
  const [deleting, setDeleting]       = useState<number | null>(null);

  // ─── Add server form ────────────────────────────────────────────────────────
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Servers</h1>
          <p className="text-sm text-muted-foreground">SSH into your servers and run AI-powered tasks</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Server
        </Button>
      </div>

      {/* Server list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 opacity-40" />
          Loading servers…
        </div>
      ) : (servers as ServerRow[]).length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl space-y-3">
          <Server className="w-12 h-12 text-muted-foreground mx-auto opacity-40" />
          <h3 className="text-lg font-medium">No servers yet</h3>
          <p className="text-sm text-muted-foreground">Add a server via SSH to run AI-powered tasks.</p>
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
                    <Badge variant="outline" className={`text-[10px] py-0 ${statusColor(s.status)}`}>
                      {s.status}
                    </Badge>
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
                  <Button
                    size="sm" variant="outline"
                    className="w-full text-xs"
                    disabled={testing === s.id}
                    onClick={() => testConnection(s)}
                  >
                    {testing === s.id ? (
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    ) : (
                      <Wifi className="w-3 h-3 mr-1.5" />
                    )}
                    Test
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="w-full text-xs"
                    onClick={() => { setTermServer(s); }}
                  >
                    <Terminal className="w-3 h-3 mr-1.5" /> Terminal
                  </Button>
                </div>

                <Button
                  size="sm"
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs"
                  onClick={() => setAgentServer(s)}
                >
                  <Bot className="w-3 h-3 mr-1.5" /> AI Agent
                </Button>

                <Button
                  size="sm" variant="ghost"
                  className="w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  disabled={deleting === s.id}
                  onClick={() => deleteServer(s.id, s.name)}
                >
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
          <SheetHeader>
            <SheetTitle>Add Server</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Server Name</Label>
                <Input placeholder="production-web-01" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Host / IP</Label>
                <Input placeholder="192.168.1.1 or server.example.com" value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />
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
                    <Button
                      key={t} size="sm" type="button"
                      variant={form.authType === t ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setForm(f => ({ ...f, authType: t }))}
                    >
                      {t === "key" ? <Key className="w-3.5 h-3.5 mr-1.5" /> : <Lock className="w-3.5 h-3.5 mr-1.5" />}
                      {t === "key" ? "SSH Key" : "Password"}
                    </Button>
                  ))}
                </div>
              </div>
              {form.authType === "key" ? (
                <div className="col-span-2 space-y-1.5">
                  <Label>Private Key (PEM)</Label>
                  <Textarea
                    className="font-mono text-xs h-40"
                    placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
                    value={form.privateKey}
                    onChange={e => setForm(f => ({ ...f, privateKey: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="col-span-2 space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" placeholder="SSH password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Provider (optional)</Label>
                <Input placeholder="AWS / DigitalOcean / etc." value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} />
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

      {/* Terminal Dialog */}
      {termServer && (
        <TerminalDialog server={termServer} onClose={() => setTermServer(null)} />
      )}

      {/* AI Agent Dialog */}
      {agentServer && (
        <AgentDialog server={agentServer} onClose={() => setAgentServer(null)} />
      )}
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
      const res = await fetch(`${import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}/api/servers/${server.id}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            Terminal — {server.name}
            <span className="font-mono text-sm text-muted-foreground font-normal">({server.username}@{server.host})</span>
          </DialogTitle>
        </DialogHeader>
        <TerminalView lines={lines} loading={running} />
        <div className="flex gap-2 mt-2">
          <div className="flex items-center text-muted-foreground font-mono text-sm px-2">$</div>
          <Input
            ref={inputRef}
            className="font-mono text-sm"
            placeholder="ls -la"
            value={cmd}
            onChange={e => setCmd(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") run(); }}
            disabled={running}
            autoFocus
          />
          <Button onClick={run} disabled={running || !cmd.trim()}>
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── AI Agent Dialog ──────────────────────────────────────────────────────────

function AgentDialog({ server, onClose }: { server: ServerRow; onClose: () => void }) {
  const [task, setTask]         = useState("");
  const [mode, setMode]         = useState<"economy" | "balanced" | "high-power">("balanced");
  const [running, setRunning]   = useState(false);
  const [plan, setPlan]         = useState<AgentStep[]>([]);
  const [current, setCurrent]   = useState(-1);
  const [done, setDone]         = useState(false);
  const [lines, setLines]       = useState<TerminalLine[]>([]);

  const add = (l: TerminalLine) => setLines(prev => [...prev, l]);

  const runAgent = async () => {
    if (!task.trim() || running) return;
    setRunning(true); setPlan([]); setCurrent(-1); setDone(false); setLines([]);
    add({ kind: "info", text: `Task: ${task}` });
    add({ kind: "info", text: "Planning commands…" });

    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    try {
      const res = await fetch(`${BASE}/api/servers/${server.id}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, mode }),
      });
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === "plan") {
              setPlan(msg.commands);
              add({ kind: "info", text: `Plan ready — ${msg.commands.length} command(s)` });
            } else if (msg.type === "step") {
              setCurrent(msg.index);
              add({ kind: "cmd", text: `[${msg.index + 1}/${msg.total}] ${msg.cmd}` });
              add({ kind: "info", text: `→ ${msg.desc}` });
            } else if (msg.type === "output") {
              msg.chunk.split("\n").filter(Boolean).forEach((t: string) => add({ kind: "out", text: t }));
            } else if (msg.type === "step_done") {
              const ok = msg.code === 0;
              add({ kind: ok ? "ok" : "err", text: ok ? "✓ done" : `✗ exit ${msg.code}` });
            } else if (msg.type === "step_error") {
              add({ kind: "err", text: `✗ ${msg.error}` });
            } else if (msg.type === "done") {
              add({ kind: "ok", text: "✓ All commands completed" });
              setDone(true); setCurrent(-1);
            } else if (msg.type === "error") {
              add({ kind: "err", text: `Error: ${msg.value}` });
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: unknown) {
      add({ kind: "err", text: String(e instanceof Error ? e.message : e) });
    } finally { setRunning(false); }
  };

  const modeLabels: Record<string, string> = { economy: "Fast", balanced: "Default", "high-power": "Max" };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-400" />
            AI SSH Agent — {server.name}
            <span className="font-mono text-sm text-muted-foreground font-normal">({server.username}@{server.host})</span>
          </DialogTitle>
        </DialogHeader>

        {/* Mode selector */}
        <div className="flex gap-2">
          {(["economy", "balanced", "high-power"] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                mode === m
                  ? "bg-purple-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {modeLabels[m]}
            </button>
          ))}
        </div>

        {/* Task input */}
        <div className="flex gap-2">
          <Textarea
            className="resize-none text-sm min-h-[60px]"
            placeholder="e.g. Check disk space and clean old logs older than 30 days"
            value={task}
            onChange={e => setTask(e.target.value)}
            disabled={running}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runAgent(); } }}
          />
          <Button
            className="h-full px-4 bg-purple-600 hover:bg-purple-500"
            disabled={running || !task.trim()}
            onClick={runAgent}
          >
            {running ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
          </Button>
        </div>

        {/* Plan sidebar + terminal */}
        {(plan.length > 0 || lines.length > 0) && (
          <div className="space-y-3">
            {plan.length > 0 && (
              <div className="border border-border rounded-lg divide-y divide-border text-xs">
                {plan.map((p, i) => (
                  <div key={i} className={`flex items-start gap-2 px-3 py-2 transition-colors ${
                    current === i ? "bg-purple-500/10" : done && i < plan.length ? "opacity-60" : ""
                  }`}>
                    <div className="mt-0.5 shrink-0">
                      {current === i ? (
                        <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                      ) : done || current > i ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-muted-foreground">{p.desc}</div>
                      <div className="font-mono text-zinc-500 truncate">{p.cmd}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <TerminalView lines={lines} loading={running && current >= 0} />
          </div>
        )}

        {done && (
          <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Task completed successfully
            <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={() => { setTask(""); setPlan([]); setLines([]); setDone(false); }}>
              New task
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
