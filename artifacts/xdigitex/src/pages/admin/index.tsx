import { useAdminGetSystemHealth, useAdminGetCosts, useAdminListUsers, useAdminListAgents, useAdminListProviders, useAdminGetAuditLogs, useAdminUpdateUserStatus, useAdminDeleteProvider } from "@workspace/api-client-react";
import { getAdminListUsersQueryKey, getAdminListProvidersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Users, Brain, Activity, Database, Server, Box, Layers, Zap,
  Shield, ShieldCheck, TrendingUp, DollarSign, Bot, Send, ScrollText,
  CheckCircle, XCircle, AlertTriangle, RefreshCw, Flag, Settings,
  Search, MoreHorizontal, Eye, Ban, Trash2, Plus, BarChart3,
  Cpu, GitBranch, Rocket, KeyRound, Store,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "providers", label: "AI Providers", icon: Brain },
  { id: "agents", label: "Agent Routing", icon: Bot },
  { id: "costs", label: "Costs", icon: DollarSign },
  { id: "billing", label: "Billing", icon: Zap },
  { id: "referrals", label: "Referrals", icon: GitBranch },
  { id: "bots", label: "Telegram Bots", icon: Send },
  { id: "deployments", label: "Deployments", icon: Rocket },
  { id: "secrets", label: "Secrets", icon: KeyRound },
  { id: "marketplace", label: "Marketplace", icon: Store },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "audit", label: "Audit Logs", icon: ScrollText },
  { id: "security", label: "Security", icon: Shield },
  { id: "queues", label: "Queues", icon: Layers },
  { id: "infra", label: "Infrastructure", icon: Server },
  { id: "flags", label: "Feature Flags", icon: Flag },
  { id: "config", label: "Configuration", icon: Settings },
];

import { LayoutDashboard } from "lucide-react";

function genSeries(n = 30, min = 50, max = 300) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (n - 1 - i));
    return { date: d.toISOString().slice(5, 10), value: Math.floor(Math.random() * (max - min) + min) };
  });
}

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: "#10a37f", Anthropic: "#d4856a", DeepSeek: "#4f85f6",
  "Google AI": "#fbbc05", Groq: "#f55036", "Mistral AI": "#ff7000",
};
const PIE_COLORS = ["#7c3aed", "#2563eb", "#059669", "#d97706", "#dc2626", "#0891b2"];

// ---------- sub-panels ----------

function timeAgo(ts: string | Date) {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function DashboardPanel({ health, costs }: { health: any; costs: any }) {
  const { data: auditLogs } = useAdminGetAuditLogs({ limit: "8" } as any);

  const s = costs?.stats ?? {};
  const stats = [
    { label: "Total Users",   value: fmtNum(s.totalUsers ?? 0),        icon: Users,    color: "text-violet-400" },
    { label: "Active Agents", value: String(s.activeAgents ?? 0),       icon: Bot,      color: "text-blue-400"   },
    { label: "Cost Today",    value: `$${Number(s.revenueToday ?? 0).toFixed(2)}`,  icon: DollarSign, color: "text-green-400" },
    { label: "Token Usage",   value: fmtNum(s.tokenUsage30d ?? 0),      icon: Zap,      color: "text-yellow-400" },
    { label: "API Requests",  value: fmtNum(s.apiRequests30d ?? 0),     icon: Activity, color: "text-pink-400"   },
    { label: "Deployments",   value: fmtNum(s.totalDeployments ?? 0),   icon: Rocket,   color: "text-cyan-400"   },
  ];

  const userGrowth: any[] = costs?.charts?.userGrowth ?? [];
  const revenueChart: any[] = costs?.charts?.revenue ?? [];

  // Provider share: convert cost amounts to percentages
  const rawProviders: { provider: string; cost: number }[] = costs?.providerCosts ?? [];
  const totalCost = rawProviders.reduce((acc, p) => acc + p.cost, 0);
  const providerUsage = rawProviders.map(p => ({
    name: p.provider,
    value: totalCost > 0 ? Math.round((p.cost / totalCost) * 100) : 0,
  }));

  const getHealth = (st: string) => st === "healthy"
    ? <span className="flex items-center gap-1 text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Healthy</span>
    : st === "warning"
    ? <span className="flex items-center gap-1 text-yellow-400"><AlertTriangle className="w-3.5 h-3.5" /> Warning</span>
    : <span className="flex items-center gap-1 text-red-400"><XCircle className="w-3.5 h-3.5" /> Critical</span>;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map(st => (
          <Card key={st.label} className="bg-card/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <st.icon className={`w-4 h-4 ${st.color}`} />
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{st.label}</span>
              </div>
              <div className="text-xl font-bold font-mono">{st.value}</div>
              <div className="text-[11px] text-muted-foreground/50 mt-0.5">live from database</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* User Growth */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">New Users (30d)</CardTitle></CardHeader>
          <CardContent>
            {userGrowth.length === 0
              ? <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">No registrations yet in this period</div>
              : (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={userGrowth}>
                    <defs>
                      <linearGradient id="uGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ fontSize: 12, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    <Area type="monotone" dataKey="value" stroke="#7c3aed" fill="url(#uGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
          </CardContent>
        </Card>

        {/* Provider usage pie */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Provider Cost Share</CardTitle></CardHeader>
          <CardContent>
            {providerUsage.length === 0
              ? <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">No AI usage yet</div>
              : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={providerUsage} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                        {providerUsage.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 mt-1">
                    {providerUsage.map((p, i) => (
                      <div key={p.name} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i] }} />
                          <span className="text-muted-foreground capitalize">{p.name}</span>
                        </div>
                        <span className="font-medium">{p.value}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Revenue / AI Cost */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">AI Spend (30d)</CardTitle></CardHeader>
          <CardContent>
            {revenueChart.length === 0
              ? <div className="h-[140px] flex items-center justify-center text-sm text-muted-foreground">No AI spend yet</div>
              : (
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={revenueChart}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ fontSize: 12, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} formatter={(v: any) => [`$${Number(v).toFixed(4)}`, "Cost"]} />
                    <Bar dataKey="value" fill="#7c3aed" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </CardContent>
        </Card>

        {/* Live Audit Feed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!auditLogs || (auditLogs as any[]).length === 0
              ? <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">No activity yet</div>
              : (
                <div className="space-y-2">
                  {(auditLogs as any[]).slice(0, 6).map((log: any) => (
                    <div key={log.id} className="flex items-start gap-2 text-[12px]">
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-primary" />
                      <span className="text-muted-foreground flex-1 truncate">
                        <span className="text-foreground font-medium">{log.user}</span>
                        {" — "}{log.action} {log.resource}
                      </span>
                      <span className="text-muted-foreground/50 shrink-0">{timeAgo(log.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>
      </div>

      {/* System Health */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">System Health</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { name: "API Gateway", key: "api" },
              { name: "Database", key: "database" },
              { name: "Message Queue", key: "queue" },
              { name: "Workers", key: "workers" },
              { name: "Storage", key: "storage" },
            ].map(svc => (
              <div key={svc.key} className="p-3 rounded-lg border bg-card/50 text-center">
                <div className="text-[11px] text-muted-foreground mb-1">{svc.name}</div>
                <div className="text-xs font-medium">{getHealth(health?.[svc.key]?.status ?? "healthy")}</div>
                {health?.[svc.key]?.latency != null && (
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">{health[svc.key].latency}ms</div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UsersPanel() {
  const [search, setSearch] = useState("");
  const { data: users, isLoading } = useAdminListUsers({ search: search || undefined });
  const updateStatus = useAdminUpdateUserStatus();
  const qc = useQueryClient();

  const handleStatus = (id: number, status: string) => {
    updateStatus.mutate({ id, data: { status } as any }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getAdminListUsersQueryKey() }),
    });
  };

  const statusColor: Record<string, string> = {
    active: "bg-green-500/15 text-green-400 border-green-500/30",
    suspended: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    banned: "bg-red-500/15 text-red-400 border-red-500/30",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search users..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" size="sm"><RefreshCw className="w-3.5 h-3.5" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[11px] text-muted-foreground uppercase tracking-wide">
                <th className="text-left p-3 font-medium">User</th>
                <th className="text-left p-3 font-medium">Role</th>
                <th className="text-left p-3 font-medium">Plan</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Spend</th>
                <th className="text-right p-3 font-medium">Joined</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading users...</td></tr>
              ) : users?.map((u: any) => (
                <tr key={u.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="p-3">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="p-3">
                    <span className="text-xs text-muted-foreground capitalize">{u.role?.replace("_", " ")}</span>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs capitalize">{u.plan}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={`text-xs ${statusColor[u.status] ?? ""}`}>{u.status}</Badge>
                  </td>
                  <td className="p-3 text-right font-mono text-xs">${(u.spend ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-right text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="w-7 h-7"><Eye className="w-3.5 h-3.5" /></Button>
                      {u.status === "active"
                        ? <Button variant="ghost" size="icon" className="w-7 h-7 text-yellow-500 hover:text-yellow-400" onClick={() => handleStatus(u.id, "suspended")}><Ban className="w-3.5 h-3.5" /></Button>
                        : <Button variant="ghost" size="icon" className="w-7 h-7 text-green-500 hover:text-green-400" onClick={() => handleStatus(u.id, "active")}><CheckCircle className="w-3.5 h-3.5" /></Button>
                      }
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-red-500 hover:text-red-400" onClick={() => handleStatus(u.id, "banned")}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ProvidersPanel() {
  const { data: providers, isLoading } = useAdminListProviders();
  const deleteProvider = useAdminDeleteProvider();
  const qc = useQueryClient();

  const statusColor: Record<string, string> = {
    active: "bg-green-500/15 text-green-400 border-green-500/30",
    inactive: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">AI Providers</h3>
        <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Provider</Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? <div className="col-span-3 text-center text-muted-foreground py-8">Loading...</div>
          : providers?.map((p: any) => (
            <Card key={p.id} className="bg-card/60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: PROVIDER_COLORS[p.name] ?? "#7c3aed" }}>
                        <Brain className="w-3.5 h-3.5 text-white" />
                      </div>
                      {p.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.type}</div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${statusColor[p.status] ?? ""}`}>{p.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
                  <div><span className="text-foreground font-medium">{p.keyCount}</span> API Keys</div>
                  <div><span className="text-foreground font-medium">{p.modelCount}</span> Models</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs">Edit</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => {
                    deleteProvider.mutate({ id: p.id }, {
                      onSuccess: () => qc.invalidateQueries({ queryKey: getAdminListProvidersQueryKey() }),
                    });
                  }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Model Management stub */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Cpu className="w-4 h-4" /> Model Registry</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-[11px] text-muted-foreground uppercase tracking-wide">
                  {["Model", "Provider", "Context", "Input $/1M", "Output $/1M", "Status"].map(h => (
                    <th key={h} className="text-left p-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { model: "GPT-4o", provider: "OpenAI", ctx: "128K", in: "$2.50", out: "$10.00", status: "active" },
                  { model: "Claude Opus 4.5", provider: "Anthropic", ctx: "200K", in: "$15.00", out: "$75.00", status: "active" },
                  { model: "Claude Sonnet 4.5", provider: "Anthropic", ctx: "200K", in: "$3.00", out: "$15.00", status: "active" },
                  { model: "DeepSeek Chat", provider: "DeepSeek", ctx: "64K", in: "$0.14", out: "$0.28", status: "active" },
                  { model: "Gemini 2.5 Pro", provider: "Google AI", ctx: "1M", in: "$1.25", out: "$5.00", status: "active" },
                  { model: "LLaMA 3.3 70B", provider: "Groq", ctx: "128K", in: "$0.59", out: "$0.79", status: "inactive" },
                ].map(m => (
                  <tr key={m.model} className="border-b border-border/30 hover:bg-muted/10">
                    <td className="p-2 font-medium">{m.model}</td>
                    <td className="p-2 text-muted-foreground">{m.provider}</td>
                    <td className="p-2">{m.ctx}</td>
                    <td className="p-2 font-mono">{m.in}</td>
                    <td className="p-2 font-mono">{m.out}</td>
                    <td className="p-2">
                      <Badge variant="outline" className={`text-[10px] ${m.status === "active" ? "text-green-400 border-green-500/30" : "text-gray-400 border-gray-500/30"}`}>{m.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentRoutingPanel() {
  const { data: agents, isLoading } = useAdminListAgents();
  const routingRows = [
    { type: "planner", provider: "OpenAI", model: "gpt-4o", desc: "Plans and decomposes tasks" },
    { type: "architect", provider: "Anthropic", model: "claude-opus-4-5", desc: "System design & architecture" },
    { type: "frontend", provider: "Anthropic", model: "claude-sonnet-4-5", desc: "UI/UX implementation" },
    { type: "backend", provider: "OpenAI", model: "gpt-4o", desc: "API & server development" },
    { type: "devops", provider: "OpenAI", model: "gpt-4o", desc: "CI/CD & infrastructure" },
    { type: "qa", provider: "DeepSeek", model: "deepseek-chat", desc: "Testing & quality assurance" },
    { type: "security", provider: "OpenAI", model: "gpt-4o", desc: "Security auditing" },
    { type: "reviewer", provider: "Anthropic", model: "claude-opus-4-5", desc: "Code review & feedback" },
    { type: "research", provider: "Google AI", model: "gemini-2.5-pro", desc: "Research & summarization" },
    { type: "telegram_bot_builder", provider: "Anthropic", model: "claude-sonnet-4-5", desc: "Telegram bot development" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Bot className="w-4 h-4" /> Agent Model Routing</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {routingRows.map(r => (
                <div key={r.type} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/40">
                  <div>
                    <div className="text-xs font-semibold capitalize">{r.type.replace("_", " ")}</div>
                    <div className="text-[11px] text-muted-foreground">{r.desc}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-primary">{r.model}</div>
                    <div className="text-[11px] text-muted-foreground">{r.provider}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Live Agent Monitor</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? <div className="text-sm text-muted-foreground">Loading agents...</div> : (
                <div className="space-y-2">
                  {agents?.slice(0, 6).map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 text-xs">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        a.status === "running" ? "bg-green-500 animate-pulse" :
                        a.status === "completed" ? "bg-blue-500" :
                        a.status === "failed" ? "bg-red-500" : "bg-gray-500"
                      }`} />
                      <div className="flex-1">
                        <div className="font-medium capitalize">{a.type}</div>
                        <div className="text-muted-foreground">Project #{a.projectId ?? "N/A"}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize">{a.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">System Prompts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {["Frontend Agent", "Backend Agent", "Security Auditor", "Code Reviewer"].map(name => (
                <div key={name} className="flex items-center justify-between text-xs p-2.5 rounded-md border bg-card/50 hover:bg-muted/20 cursor-pointer">
                  <span className="font-medium">{name} Prompt</span>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span>v3</span>
                    <Settings className="w-3 h-3" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CostsPanel({ costs }: { costs: any }) {
  const spending = genSeries(30, 30, 120);
  const limits = [
    { label: "Global Monthly", limit: 5000, used: 1284 },
    { label: "Per Workspace", limit: 500, used: 149 },
    { label: "Per User", limit: 100, used: 45 },
    { label: "Per Agent", limit: 50, used: 12 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Today's Cost", value: `$${costs?.dailySpend?.toFixed(2) ?? "42.80"}`, color: "text-blue-400" },
          { label: "Monthly Cost", value: `$${costs?.monthlySpend?.toFixed(2) ?? "1,284.40"}`, color: "text-violet-400" },
          { label: "Monthly Revenue", value: `$${costs?.revenue?.toFixed(2) ?? "12,480.00"}`, color: "text-green-400" },
          { label: "Net Profit", value: `$${costs?.profit?.toFixed(2) ?? "11,195.60"}`, color: "text-yellow-400" },
        ].map(s => (
          <Card key={s.label} className="bg-card/60">
            <CardContent className="p-4">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">{s.label}</div>
              <div className={`text-2xl font-mono font-bold ${s.color}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Daily Spend (30d)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={spending}>
                <defs>
                  <linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip contentStyle={{ fontSize: 12, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} formatter={(v: any) => [`$${v}`, "Spend"]} />
                <Area type="monotone" dataKey="value" stroke="#f59e0b" fill="url(#spGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Spending Limits</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {limits.map(l => {
              const pct = Math.round((l.used / l.limit) * 100);
              return (
                <div key={l.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{l.label}</span>
                    <span className="font-mono">${l.used} / ${l.limit}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct > 80 ? "bg-red-500" : pct > 60 ? "bg-yellow-500" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <Button variant="outline" size="sm" className="w-full mt-2 text-xs">Configure Limits</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Provider Cost Breakdown</CardTitle></CardHeader>
          <CardContent>
            {costs?.providerCosts?.map((p: any, i: number) => (
              <div key={p.provider} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-sm">{p.provider}</span>
                </div>
                <span className="font-mono text-sm">${p.cost.toFixed(2)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Cost Alerts</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { threshold: "80%", action: "Warn via email", active: true },
              { threshold: "90%", action: "Throttle new agents", active: true },
              { threshold: "100%", action: "Block all requests", active: false },
            ].map(a => (
              <div key={a.threshold} className="flex items-center justify-between p-2.5 rounded-md border bg-card/50">
                <div>
                  <div className="text-xs font-medium">{a.threshold} budget reached</div>
                  <div className="text-[11px] text-muted-foreground">{a.action}</div>
                </div>
                <div className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${a.active ? "bg-primary" : "bg-muted"}`} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AuditLogsPanel() {
  const { data: logs, isLoading } = useAdminGetAuditLogs({ limit: 50 });
  const [search, setSearch] = useState("");
  const filtered = (logs ?? []).filter((l: any) =>
    !search || l.action?.toLowerCase().includes(search.toLowerCase()) || l.user?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search logs..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" size="sm">Export CSV</Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[11px] text-muted-foreground uppercase tracking-wide">
                {["Timestamp", "Admin", "Action", "Resource", "Details"].map(h => (
                  <th key={h} className="text-left p-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading logs...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No audit logs found</td></tr>
              ) : filtered.map((l: any) => (
                <tr key={l.id} className="border-b border-border/40 hover:bg-muted/10 font-mono text-xs">
                  <td className="p-3 text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</td>
                  <td className="p-3">{l.user}</td>
                  <td className="p-3"><Badge variant="outline" className="text-[10px]">{l.action}</Badge></td>
                  <td className="p-3 text-muted-foreground">{l.resource}</td>
                  <td className="p-3 text-muted-foreground">{l.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SecurityPanel() {
  const metrics = [
    { label: "Failed Logins (24h)", value: 12, color: "text-red-400" },
    { label: "Blocked IPs", value: 3, color: "text-orange-400" },
    { label: "Active Sessions", value: 847, color: "text-green-400" },
    { label: "API Abuse Flags", value: 0, color: "text-muted-foreground" },
  ];
  const events = [
    { event: "Failed login from 192.168.1.50", time: "2m ago", level: "warn" },
    { event: "IP 45.33.100.200 blocked after 10 attempts", time: "18m ago", level: "critical" },
    { event: "2FA bypassed attempt from unknown device", time: "45m ago", level: "critical" },
    { event: "Rate limit triggered for API key xdx_prod_a3f2", time: "1h ago", level: "warn" },
    { event: "Admin login from new IP — San Francisco, CA", time: "2h ago", level: "info" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map(m => (
          <Card key={m.label} className="bg-card/60">
            <CardContent className="p-4">
              <div className="text-[11px] text-muted-foreground mb-1">{m.label}</div>
              <div className={`text-3xl font-mono font-bold ${m.color}`}>{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-red-400" /> Security Events</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {events.map((ev, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-md bg-card/50 border border-border/40">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${ev.level === "critical" ? "bg-red-500" : ev.level === "warn" ? "bg-yellow-500" : "bg-blue-500"}`} />
                <div className="flex-1 text-xs">
                  <div>{ev.event}</div>
                  <div className="text-muted-foreground mt-0.5">{ev.time}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Security Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Force logout all sessions", variant: "outline", danger: false },
              { label: "Reset all API rate limits", variant: "outline", danger: false },
              { label: "Enable maintenance mode", variant: "outline", danger: false },
              { label: "Lock all new registrations", variant: "outline", danger: true },
              { label: "Emergency shutdown", variant: "destructive", danger: true },
            ].map(a => (
              <Button key={a.label} variant={a.variant as any} size="sm" className={`w-full justify-start text-xs ${a.danger && a.variant !== "destructive" ? "text-red-400 border-red-500/30 hover:bg-red-500/10" : ""}`}>
                {a.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfraPanel({ health }: { health: any }) {
  const services = [
    { name: "API Gateway", key: "api", icon: Server },
    { name: "Primary Database", key: "database", icon: Database },
    { name: "Message Queue", key: "queue", icon: Layers },
    { name: "Worker Nodes", key: "workers", icon: Activity },
    { name: "Storage Service", key: "storage", icon: Box },
    { name: "WebSocket", key: "ws", icon: Zap },
  ];

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map(svc => {
          const data = health?.[svc.key] ?? { status: "healthy", latency: Math.floor(Math.random() * 50 + 5) };
          const color = data.status === "healthy" ? "border-green-500/30 bg-green-500/5" : data.status === "warning" ? "border-yellow-500/30 bg-yellow-500/5" : "border-red-500/30 bg-red-500/5";
          return (
            <Card key={svc.key} className={`border ${color}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-md bg-muted"><svc.icon className="w-4 h-4" /></div>
                  <div>
                    <div className="font-medium text-sm">{svc.name}</div>
                    <div className="text-xs text-muted-foreground">{data.latency}ms latency</div>
                  </div>
                </div>
                <Badge variant="outline" className={`text-xs ${data.status === "healthy" ? "text-green-400 border-green-500/30" : data.status === "warning" ? "text-yellow-400 border-yellow-500/30" : "text-red-400 border-red-500/30"}`}>
                  {data.status}
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4" /> Queue Monitor</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-[11px] text-muted-foreground uppercase tracking-wide">
                {["Queue", "Pending", "Running", "Completed", "Failed", "Actions"].map(h => (
                  <th key={h} className="text-left p-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { name: "agent-tasks", pending: 12, running: 3, completed: 1847, failed: 2 },
                { name: "deployments", pending: 2, running: 1, completed: 142, failed: 0 },
                { name: "notifications", pending: 45, running: 5, completed: 8920, failed: 1 },
                { name: "billing-webhooks", pending: 0, running: 0, completed: 287, failed: 0 },
              ].map(q => (
                <tr key={q.name} className="border-b border-border/30 hover:bg-muted/10">
                  <td className="p-2 font-medium font-mono">{q.name}</td>
                  <td className="p-2 text-yellow-400">{q.pending}</td>
                  <td className="p-2 text-blue-400">{q.running}</td>
                  <td className="p-2 text-green-400">{q.completed}</td>
                  <td className="p-2 text-red-400">{q.failed}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">Retry</Button>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">Pause</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function FeatureFlagsPanel() {
  const [flags, setFlags] = useState([
    { name: "Telegram Bots", enabled: true, desc: "Allow users to create Telegram bots" },
    { name: "Marketplace", enabled: true, desc: "Template marketplace module" },
    { name: "Claude Models", enabled: true, desc: "Anthropic Claude model family" },
    { name: "GPT Models", enabled: true, desc: "OpenAI GPT model family" },
    { name: "DeepSeek Models", enabled: true, desc: "DeepSeek model access" },
    { name: "Referrals", enabled: true, desc: "Referral and affiliate system" },
    { name: "Promotions", enabled: true, desc: "Coupon and promo code system" },
    { name: "SSH Servers", enabled: true, desc: "Custom SSH server management" },
    { name: "Beta Features", enabled: false, desc: "Experimental features for beta users" },
    { name: "Maintenance Mode", enabled: false, desc: "Show maintenance page to all users" },
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Feature Flags</h3>
        <Button size="sm" className="text-xs gap-1.5"><Plus className="w-3.5 h-3.5" /> New Flag</Button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {flags.map((f, i) => (
          <Card key={f.name} className="bg-card/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{f.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{f.desc}</div>
              </div>
              <button
                onClick={() => setFlags(fl => fl.map((x, j) => j === i ? { ...x, enabled: !x.enabled } : x))}
                className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${f.enabled ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${f.enabled ? "left-5" : "left-0.5"}`} />
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SimplePanel({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-2"><Icon className="w-4 h-4 text-primary" />{title}</h3>
      {children}
    </div>
  );
}

// ---------- Main Component ----------

export default function Admin() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { data: health, isLoading: healthLoading } = useAdminGetSystemHealth();
  const { data: costs } = useAdminGetCosts();

  const renderPanel = () => {
    switch (activeTab) {
      case "dashboard": return <DashboardPanel health={health} costs={costs} />;
      case "users": return <UsersPanel />;
      case "providers": return <ProvidersPanel />;
      case "agents": return <AgentRoutingPanel />;
      case "costs": return <CostsPanel costs={costs} />;
      case "billing": return (
        <SimplePanel title="Billing Administration" icon={Zap}>
          <div className="grid md:grid-cols-3 gap-4">
            {[{ label: "Payments", n: 487, delta: "+24 today" }, { label: "Active Subscriptions", n: 312, delta: "98% retention" }, { label: "MRR", n: "$12,480", delta: "+$840 this month" }].map(s => (
              <Card key={s.label}><CardContent className="p-4"><div className="text-xs text-muted-foreground mb-1">{s.label}</div><div className="text-2xl font-bold font-mono">{s.n}</div><div className="text-xs text-green-400 mt-0.5">{s.delta}</div></CardContent></Card>
            ))}
          </div>
          <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground text-center py-8">Billing administration tables — connect PesaPal webhooks to populate live payment data.</div></CardContent></Card>
        </SimplePanel>
      );
      case "referrals": return (
        <SimplePanel title="Referral System" icon={GitBranch}>
          <div className="grid md:grid-cols-4 gap-4">
            {[{ label: "Total Referrals", v: "24" }, { label: "Active", v: "18" }, { label: "Total Earnings", v: "$1,840.50" }, { label: "Pending Payout", v: "$240.00" }].map(s => (
              <Card key={s.label}><CardContent className="p-4"><div className="text-xs text-muted-foreground mb-1">{s.label}</div><div className="text-xl font-bold">{s.v}</div></CardContent></Card>
            ))}
          </div>
          <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground text-center py-8">Referral management — approve payouts, adjust commission rates, and manage partner tiers.</div></CardContent></Card>
        </SimplePanel>
      );
      case "bots": return (
        <SimplePanel title="Telegram Bot Management" icon={Send}>
          <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground text-center py-8">Platform-wide bot overview — view all user bots, their status, message volume, and deployment health.</div></CardContent></Card>
        </SimplePanel>
      );
      case "deployments": return (
        <SimplePanel title="Deployment Management" icon={Rocket}>
          <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground text-center py-8">Platform-wide deployment monitor — all environments, owners, statuses with restart and rollback actions.</div></CardContent></Card>
        </SimplePanel>
      );
      case "secrets": return (
        <SimplePanel title="Secrets Vault (Admin)" icon={KeyRound}>
          <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground text-center py-8">Global secrets inventory — workspace-scoped secrets with last-accessed audit trail. All access logged.</div></CardContent></Card>
        </SimplePanel>
      );
      case "marketplace": return (
        <SimplePanel title="Marketplace Administration" icon={Store}>
          <div className="grid md:grid-cols-3 gap-4">
            {[{ label: "Pending Review", n: 3, color: "text-yellow-400" }, { label: "Approved", n: 6, color: "text-green-400" }, { label: "Total Downloads", n: "7,610", color: "text-blue-400" }].map(s => (
              <Card key={s.label}><CardContent className="p-4"><div className="text-xs text-muted-foreground mb-1">{s.label}</div><div className={`text-2xl font-bold ${s.color}`}>{s.n}</div></CardContent></Card>
            ))}
          </div>
          <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground text-center py-8">Review pending templates, manage approvals, feature top content, and moderate ratings.</div></CardContent></Card>
        </SimplePanel>
      );
      case "analytics": return (
        <SimplePanel title="Analytics Center" icon={BarChart3}>
          <div className="grid md:grid-cols-2 gap-6">
            {[{ title: "User Growth", color: "#7c3aed" }, { title: "Revenue Growth", color: "#059669" }, { title: "Agent Usage", color: "#2563eb" }, { title: "Token Consumption", color: "#d97706" }].map(chart => (
              <Card key={chart.title}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{chart.title}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={genSeries(30, 50, 300)}>
                      <defs><linearGradient id={`grad-${chart.title}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={chart.color} stopOpacity={0.3}/><stop offset="95%" stopColor={chart.color} stopOpacity={0}/></linearGradient></defs>
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                      <YAxis hide />
                      <Tooltip contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Area type="monotone" dataKey="value" stroke={chart.color} fill={`url(#grad-${chart.title})`} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ))}
          </div>
        </SimplePanel>
      );
      case "audit": return <AuditLogsPanel />;
      case "security": return <SecurityPanel />;
      case "infra": return <InfraPanel health={health} />;
      case "flags": return <FeatureFlagsPanel />;
      case "queues": return (
        <SimplePanel title="Queue Management" icon={Layers}>
          <InfraPanel health={health} />
        </SimplePanel>
      );
      case "config": return (
        <SimplePanel title="Configuration Center" icon={Settings}>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { title: "App Settings", fields: ["App Name", "Support Email", "Logo URL", "Primary Color"] },
              { title: "Email / SMTP", fields: ["SMTP Host", "SMTP Port", "From Address", "SMTP Password"] },
              { title: "Domain Settings", fields: ["Primary Domain", "CDN URL", "Webhook Base URL"] },
              { title: "Security", fields: ["Session Timeout (min)", "Max Login Attempts", "2FA Requirement", "IP Whitelist"] },
            ].map(section => (
              <Card key={section.title}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{section.title}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {section.fields.map(f => (
                    <div key={f} className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">{f}</label>
                      <Input className="h-8 text-xs" placeholder={f} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
          <Button className="w-full max-w-xs">Save Configuration</Button>
        </SimplePanel>
      );
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-red-400" />
            Admin Control Panel
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Full platform administration and monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Tab Nav */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
              activeTab === tab.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div>{renderPanel()}</div>
    </div>
  );
}
