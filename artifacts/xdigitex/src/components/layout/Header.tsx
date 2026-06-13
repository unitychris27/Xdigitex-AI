import { Bell, Search, Moon, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/providers/ThemeProvider";

export function Header() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="h-14 border-b border-border bg-background flex items-center justify-between px-4">
      <div className="flex items-center flex-1">
        <div className="relative w-96 max-w-md hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search resources... (Cmd+K)"
            className="w-full bg-muted/50 border-transparent focus-visible:border-primary pl-9 h-9"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="w-9 h-9"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
        <Button variant="ghost" size="icon" className="w-9 h-9 relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
        </Button>
        <Button variant="ghost" size="icon" className="w-9 h-9 ml-2 rounded-full bg-muted">
          <User className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}