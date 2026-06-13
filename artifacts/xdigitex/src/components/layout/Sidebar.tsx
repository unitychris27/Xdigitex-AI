import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  Cpu,
  Zap,
  Rocket,
  Server,
  KeyRound,
  CreditCard,
  Gift,
  Store,
  BarChart3,
  Settings,
  ShieldCheck,
  Bot,
  FolderOpen,
  Globe,
} from "lucide-react";

const mainNav = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Projects", href: "/projects", icon: FolderKanban },
  { title: "AI Workspace", href: "/workspace", icon: Cpu },
  { title: "My Automations", href: "/automations", icon: Zap },
  { title: "Deployments", href: "/deployments", icon: Rocket },
  { title: "Servers", href: "/servers", icon: Server },
  { title: "Secrets Vault", href: "/secrets", icon: KeyRound },
  { title: "Files", href: "/files", icon: FolderOpen },
  { title: "Agents", href: "/agents", icon: Bot },
  { title: "Marketplace", href: "/marketplace", icon: Globe },
];

const filteredSecondary = [
  { title: "Analytics", href: "/analytics", icon: BarChart3 },
  { title: "Billing", href: "/billing", icon: CreditCard },
  { title: "Referrals", href: "/referrals", icon: Gift },
  { title: "Settings", href: "/settings", icon: Settings },
  { title: "Admin", href: "/admin", icon: ShieldCheck },
];

function NavItem({ item, location }: { item: { title: string; href: string; icon: React.ElementType }; location: string }) {
  const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
    >
      <item.icon className="w-4 h-4 shrink-0" />
      {item.title}
    </Link>
  );
}

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="flex h-full w-60 flex-col bg-sidebar border-r border-sidebar-border text-sidebar-foreground shrink-0">
      <div className="p-4 flex items-center gap-2 font-bold text-xl tracking-tight text-primary border-b border-sidebar-border shrink-0">
        <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center text-xs font-black">
          XD
        </div>
        XDIGITEX AI
      </div>

      <div className="flex-1 overflow-y-auto py-3 scrollbar-thin">
        <nav className="space-y-0.5 px-2">
          {mainNav.map((item) => (
            <NavItem key={item.href} item={item} location={location} />
          ))}
        </nav>

        <div className="mt-5 mb-2 px-4 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest">
          Platform
        </div>

        <nav className="space-y-0.5 px-2">
          {filteredSecondary.map((item) => (
            <NavItem key={item.href} item={item} location={location} />
          ))}
        </nav>
      </div>
    </div>
  );
}
