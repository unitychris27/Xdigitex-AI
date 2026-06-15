import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { X } from "lucide-react";
import {
  LayoutDashboard, FolderKanban, Cpu, Zap, Rocket, Server,
  KeyRound, CreditCard, Gift, BarChart3, Settings,
  ShieldCheck, Bot, FolderOpen, Globe,
} from "lucide-react";

const mainNav = [
  { title: "Dashboard",     href: "/dashboard",   icon: LayoutDashboard },
  { title: "Projects",      href: "/projects",    icon: FolderKanban    },
  { title: "AI Workspace",  href: "/workspace",   icon: Cpu             },
  { title: "My Automations",href: "/automations", icon: Zap             },
  { title: "Deployments",   href: "/deployments", icon: Rocket          },
  { title: "Servers",       href: "/servers",     icon: Server          },
  { title: "Secrets Vault", href: "/secrets",     icon: KeyRound        },
  { title: "Files",         href: "/files",       icon: FolderOpen      },
  { title: "Agents",        href: "/agents",      icon: Bot             },
  { title: "Marketplace",   href: "/marketplace", icon: Globe           },
];

const platformNav = [
  { title: "Analytics", href: "/analytics", icon: BarChart3, adminOnly: false },
  { title: "Billing",   href: "/billing",   icon: CreditCard, adminOnly: false },
  { title: "Referrals", href: "/referrals", icon: Gift,       adminOnly: false },
  { title: "Settings",  href: "/settings",  icon: Settings,   adminOnly: false },
  { title: "Admin",     href: "/admin",     icon: ShieldCheck, adminOnly: true  },
];

function NavItem({
  item,
  location,
  onClick,
}: {
  item: { title: string; href: string; icon: React.ElementType };
  location: string;
  onClick?: () => void;
}) {
  const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
  return (
    <Link
      href={item.href}
      onClick={onClick}
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

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const [location] = useLocation();
  const { isAdmin, user } = useAuth();

  const visiblePlatformNav = platformNav.filter(item => !item.adminOnly || isAdmin);
  const isPremium = (user as { plan?: string } | null)?.plan === "premium";

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border text-sidebar-foreground shrink-0">
      {/* Logo + close button */}
      <div className="p-4 flex items-center justify-between border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-primary">
          <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center text-xs font-black shrink-0">
            XD
          </div>
          XDIGITEX AI
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav items */}
      <div className="flex-1 overflow-y-auto py-3 scrollbar-thin">
        <nav className="space-y-0.5 px-2">
          {mainNav.map(item => (
            <NavItem key={item.href} item={item} location={location} onClick={onClose} />
          ))}
        </nav>

        <div className="mt-5 mb-2 px-4 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest">
          Platform
        </div>

        <nav className="space-y-0.5 px-2">
          {visiblePlatformNav.map(item => (
            <NavItem key={item.href} item={item} location={location} onClick={onClose} />
          ))}
        </nav>
      </div>

      {/* XDIGITEX AI Stamp — shown to non-premium users as upgrade CTA */}
      {!isPremium && (
        <div className="p-3 border-t border-sidebar-border shrink-0">
          <a
            href="/billing"
            onClick={onClose}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 bg-purple-600/10 border border-purple-500/20 hover:bg-purple-600/20 hover:border-purple-500/40 transition-all group cursor-pointer"
          >
            <div className="w-6 h-6 rounded bg-gradient-to-br from-purple-500 to-violet-600 text-white flex items-center justify-center text-[9px] font-black shrink-0 shadow-sm">
              XD
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-purple-300 leading-tight">XDIGITEX AI</div>
              <div className="text-[10px] text-zinc-500 group-hover:text-purple-400 transition-colors leading-tight">
                Upgrade to Premium ↗
              </div>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
          </a>
        </div>
      )}
    </div>
  );
}
