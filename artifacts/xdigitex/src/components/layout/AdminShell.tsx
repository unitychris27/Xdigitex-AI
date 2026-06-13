import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Users, Brain, Cpu, Bot, CreditCard, Gift, Megaphone,
  Send, Rocket, KeyRound, Store, BarChart3, ScrollText, Shield,
  Layers, Server, Flag, Settings, LogOut, ChevronRight, Activity,
  Database, Zap,
} from "lucide-react";

const adminNav = [
  { section: "Overview", items: [
    { title: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
  ]},
  { section: "Users & Teams", items: [
    { title: "Users", href: "/admin/users", icon: Users },
  ]},
  { section: "AI Platform", items: [
    { title: "Providers", href: "/admin/providers", icon: Brain },
    { title: "Models", href: "/admin/models", icon: Cpu },
    { title: "Agent Routing", href: "/admin/agents", icon: Bot },
  ]},
  { section: "Finance", items: [
    { title: "Costs", href: "/admin/costs", icon: Zap },
    { title: "Billing", href: "/admin/billing", icon: CreditCard },
    { title: "Referrals", href: "/admin/referrals", icon: Gift },
    { title: "Promotions", href: "/admin/promotions", icon: Megaphone },
  ]},
  { section: "Platform", items: [
    { title: "Bots", href: "/admin/bots", icon: Send },
    { title: "Deployments", href: "/admin/deployments", icon: Rocket },
    { title: "Secrets", href: "/admin/secrets", icon: KeyRound },
    { title: "Marketplace", href: "/admin/marketplace", icon: Store },
  ]},
  { section: "Monitoring", items: [
    { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    { title: "Audit Logs", href: "/admin/audit", icon: ScrollText },
    { title: "Security", href: "/admin/security", icon: Shield },
    { title: "Queues", href: "/admin/queues", icon: Layers },
  ]},
  { section: "Infrastructure", items: [
    { title: "System Health", href: "/admin/infrastructure", icon: Server },
    { title: "Feature Flags", href: "/admin/flags", icon: Flag },
    { title: "Configuration", href: "/admin/config", icon: Settings },
  ]},
];

function NavLink({ href, icon: Icon, title, exact, location }: { href: string; icon: React.ElementType; title: string; exact?: boolean; location: string }) {
  const isActive = exact ? location === href : location.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
        isActive
          ? "bg-primary/15 text-primary"
          : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {title}
      {isActive && <ChevronRight className="w-3 h-3 ml-auto text-primary/60" />}
    </Link>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Admin Sidebar */}
      <div className="w-56 flex flex-col bg-sidebar border-r border-sidebar-border text-sidebar-foreground shrink-0">
        {/* Logo */}
        <div className="p-4 flex items-center gap-2 border-b border-sidebar-border">
          <div className="w-7 h-7 rounded bg-red-500/90 text-white flex items-center justify-center text-[10px] font-black shrink-0">
            ADM
          </div>
          <div>
            <div className="text-sm font-bold text-red-400 leading-none">XDIGITEX</div>
            <div className="text-[10px] text-muted-foreground">Admin Control</div>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {adminNav.map((group) => (
            <div key={group.section} className="mb-3">
              <div className="px-3 mb-1 text-[10px] font-semibold text-sidebar-foreground/35 uppercase tracking-widest">
                {group.section}
              </div>
              <div className="space-y-0.5 px-1.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} {...item} location={location} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-3 space-y-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
          >
            <Activity className="w-3.5 h-3.5" />
            Back to App
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-400/80 hover:text-red-400 rounded-md hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Admin top bar */}
        <div className="h-12 border-b border-border flex items-center px-6 gap-4 bg-background/95 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="w-3.5 h-3.5 text-green-500" />
            <span className="text-green-500 font-medium">System Online</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Signed in as</span>
            <span className="text-foreground font-medium">{user?.email ?? "admin"}</span>
            <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 text-[10px] font-bold uppercase">
              {user?.role?.replace("_", " ") ?? "admin"}
            </span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
