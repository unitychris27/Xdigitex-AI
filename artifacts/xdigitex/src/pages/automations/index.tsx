import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Zap, Plus, MessageCircle, Webhook, Clock, Mail, Globe,
  GitBranch, Database, Server, Bot, Play, Pause, Trash2,
  ChevronRight, ArrowRight,
} from "lucide-react";

const TRIGGER_TYPES = [
  { id: "telegram", label: "Telegram", icon: MessageCircle, color: "text-sky-400 bg-sky-500/10 border-sky-500/20", desc: "Respond to messages & commands" },
  { id: "webhook", label: "Webhook", icon: Webhook, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", desc: "Trigger on HTTP events" },
  { id: "cron", label: "Cron Job", icon: Clock, color: "text-amber-400 bg-amber-500/10 border-amber-500/20", desc: "Run on a schedule" },
  { id: "api", label: "API Trigger", icon: Globe, color: "text-green-400 bg-green-500/10 border-green-500/20", desc: "REST API endpoint" },
  { id: "email", label: "Email", icon: Mail, color: "text-pink-400 bg-pink-500/10 border-pink-500/20", desc: "On incoming emails" },
  { id: "github", label: "GitHub", icon: GitBranch, color: "text-gray-400 bg-gray-500/10 border-gray-500/20", desc: "On push / PR events" },
  { id: "database", label: "Database", icon: Database, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", desc: "On data changes" },
  { id: "ssh", label: "SSH / Server", icon: Server, color: "text-red-400 bg-red-500/10 border-red-500/20", desc: "Remote server tasks" },
];

const AUTOMATION_EXAMPLES = [
  {
    name: "Telegram Order Bot",
    trigger: "Telegram",
    triggerIcon: MessageCircle,
    steps: ["Receive order message", "Save to database", "Send confirmation", "Notify admin"],
    status: "active",
    runs: 1284,
  },
  {
    name: "Auto Deployment",
    trigger: "GitHub",
    triggerIcon: GitBranch,
    steps: ["GitHub push event", "SSH to server", "Pull changes", "Restart app"],
    status: "active",
    runs: 47,
  },
  {
    name: "Server Monitor",
    trigger: "Cron",
    triggerIcon: Clock,
    steps: ["Check CPU/RAM every 5min", "If above 80%", "Send Telegram alert"],
    status: "paused",
    runs: 8820,
  },
];

const statusStyles: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  error: "bg-red-500/10 text-red-400 border-red-500/20",
};

type View = "list" | "new";

export default function Automations() {
  const [view, setView] = useState<View>("list");
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {view === "list" ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">My Automations</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Build AI-powered automations — connect Telegram, servers, APIs, webhooks and more.
              </p>
            </div>
            <Button onClick={() => setView("new")} className="gap-2">
              <Plus className="w-4 h-4" /> New Automation
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Active Automations", value: "2", sub: "running now" },
              { label: "Total Runs", value: "10,151", sub: "all time" },
              { label: "Connected Triggers", value: "3", sub: "Telegram, GitHub, Cron" },
            ].map(s => (
              <Card key={s.label} className="bg-card/50 border-border/50">
                <CardContent className="pt-4 pb-3">
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-xs font-medium text-foreground mt-0.5">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground">{s.sub}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Existing automations */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Your Automations</h2>
            {AUTOMATION_EXAMPLES.map(auto => (
              <Card key={auto.name} className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                      <auto.triggerIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{auto.name}</span>
                        <Badge variant="outline" className={`text-[10px] ${statusStyles[auto.status]}`}>{auto.status}</Badge>
                        <span className="text-[11px] text-muted-foreground ml-auto">{auto.runs.toLocaleString()} runs</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {auto.steps.map((step, i) => (
                          <span key={i} className="flex items-center gap-1">
                            <span className="text-[11px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">{step}</span>
                            {i < auto.steps.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground/40" />}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {auto.status === "active"
                        ? <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"><Pause className="w-3.5 h-3.5" /></Button>
                        : <Button size="icon" variant="ghost" className="h-7 w-7 text-green-400"><Play className="w-3.5 h-3.5" /></Button>
                      }
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setView("list"); setSelectedTrigger(null); }} className="text-muted-foreground">
              ← Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">New Automation</h1>
              <p className="text-sm text-muted-foreground">Choose a trigger to start building</p>
            </div>
          </div>

          {!selectedTrigger ? (
            <div>
              <p className="text-sm text-muted-foreground mb-4">What should trigger this automation?</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {TRIGGER_TYPES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTrigger(t.id)}
                    className={`flex flex-col items-start gap-2 p-4 rounded-xl border ${t.color} hover:scale-[1.02] transition-all text-left`}
                  >
                    <t.icon className="w-5 h-5" />
                    <div>
                      <div className="font-semibold text-sm">{t.label}</div>
                      <div className="text-[11px] opacity-70">{t.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <AutomationBuilder trigger={selectedTrigger} onBack={() => setSelectedTrigger(null)} />
          )}
        </>
      )}
    </div>
  );
}

function AutomationBuilder({ trigger, onBack }: { trigger: string; onBack: () => void }) {
  const t = TRIGGER_TYPES.find(x => x.id === trigger)!;

  const BLOCKS = [
    { id: "trigger", label: `${t.label} Trigger`, color: "border-primary/40 bg-primary/5", icon: t.icon },
    { id: "condition", label: "Condition", color: "border-amber-500/40 bg-amber-500/5 text-amber-400", icon: Zap },
    { id: "ai", label: "AI Action", color: "border-purple-500/40 bg-purple-500/5 text-purple-400", icon: Bot },
    { id: "database", label: "Save to Database", color: "border-blue-500/40 bg-blue-500/5 text-blue-400", icon: Database },
    { id: "reply", label: "Send Reply", color: "border-green-500/40 bg-green-500/5 text-green-400", icon: MessageCircle },
  ];

  return (
    <div className="grid grid-cols-5 gap-6">
      <div className="col-span-2 space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Flow Builder</h3>
        <div className="space-y-2">
          {BLOCKS.map((block, i) => (
            <div key={block.id} className="flex flex-col items-center">
              <div className={`w-full flex items-center gap-3 p-3 rounded-lg border ${block.color} cursor-pointer hover:opacity-80 transition-opacity`}>
                <block.icon className="w-4 h-4 shrink-0" />
                <span className="text-sm font-medium">{block.label}</span>
              </div>
              {i < BLOCKS.length - 1 && (
                <div className="w-px h-4 bg-border/60" />
              )}
            </div>
          ))}
        </div>
        <div className="pt-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full">
            <Plus className="w-3.5 h-3.5" /> Add Block
          </Button>
        </div>
      </div>

      <div className="col-span-3 space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Configuration</h3>

        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <t.icon className="w-4 h-4 text-primary" /> {t.label} Trigger Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {trigger === "telegram" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Bot Token</label>
                  <input className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Enter from @BotFather..." />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Trigger on</label>
                  <select className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-sm focus:outline-none">
                    <option>Any message</option>
                    <option>Command (/start, /order...)</option>
                    <option>Keyword match</option>
                  </select>
                </div>
              </>
            )}
            {trigger === "cron" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Schedule (cron expression)</label>
                <input className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary" placeholder="*/5 * * * * (every 5 min)" />
              </div>
            )}
            {trigger === "webhook" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Webhook URL (auto-generated)</label>
                <input readOnly className="w-full bg-muted/30 border border-border rounded px-3 py-2 text-sm font-mono text-muted-foreground" value="https://api.xdigitex.ai/webhook/abc123" />
              </div>
            )}
            {!["telegram", "cron", "webhook"].includes(trigger) && (
              <p className="text-sm text-muted-foreground">Configure {t.label} trigger settings here.</p>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2 pt-2">
          <Button className="gap-1.5 flex-1">
            <Play className="w-4 h-4" /> Deploy Automation
          </Button>
          <Button variant="outline" className="gap-1.5">
            Save Draft
          </Button>
        </div>
      </div>
    </div>
  );
}
