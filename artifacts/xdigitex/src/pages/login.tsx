import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useLogin, useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Eye, EyeOff, Zap, GitBranch, Bot, Rocket } from "lucide-react";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}

const FEATURES = [
  { icon: Bot, text: "Multi-agent AI development" },
  { icon: Rocket, text: "One-click deployments" },
  { icon: GitBranch, text: "Full project orchestration" },
  { icon: Zap, text: "10+ AI model providers" },
];

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();

  const [showPw, setShowPw] = useState(false);

  // Handle Google OAuth callback: /login?oauth_success=...&dest=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthSuccess = params.get("oauth_success");
    const oauthError = params.get("error");
    if (oauthSuccess) {
      try {
        const { user, token } = JSON.parse(decodeURIComponent(oauthSuccess));
        login(user, token);
        toast.success(`Welcome, ${user.name}!`);
        const dest = params.get("dest") ?? "/dashboard";
        window.history.replaceState({}, "", "/login");
        setLocation(dest);
      } catch {
        toast.error("Google sign-in failed. Please try again.");
      }
    } else if (oauthError) {
      toast.error(`Google sign-in error: ${decodeURIComponent(oauthError)}`);
      window.history.replaceState({}, "", "/login");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPw, setRegPw] = useState("");

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const handleRedirect = (user: any) => {
    const role = user?.role ?? "user";
    const isAdmin = ["super_admin", "admin", "moderator", "support"].includes(role);
    setLocation(isAdmin ? "/admin" : "/dashboard");
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { email: loginEmail, password: loginPw } }, {
      onSuccess: (data: any) => {
        login(data.user, data.token);
        toast.success(`Welcome back, ${data.user.name}`);
        handleRedirect(data.user);
      },
      onError: () => toast.error("Invalid credentials"),
    });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate({ data: { name: regName, email: regEmail, password: regPw } }, {
      onSuccess: (data: any) => {
        login(data.user, data.token);
        toast.success("Account created successfully");
        handleRedirect(data.user);
      },
      onError: () => toast.error("Registration failed"),
    });
  };

  const handleGoogle = () => {
    // Redirect to server-side Google OAuth flow
    window.location.href = `${window.location.origin}/api/auth/google`;
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left: branding panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 bg-sidebar border-r border-sidebar-border p-10">
        <div>
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-black">XD</div>
            <span className="font-bold text-lg tracking-tight text-primary">XDIGITEX AI</span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight mb-3">The command center for AI-powered development</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-10">
            Build, deploy and orchestrate intelligent multi-agent systems at scale. One platform for every step of the AI development lifecycle.
          </p>

          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-sm text-muted-foreground">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-muted-foreground/50">
          &copy; {new Date().getFullYear()} XDIGITEX AI — All rights reserved
        </div>
      </div>

      {/* Right: auth forms */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-black">XD</div>
            <span className="font-bold text-base text-primary">XDIGITEX AI</span>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            {/* Sign In */}
            <TabsContent value="signin" className="space-y-5">
              <div>
                <h1 className="text-xl font-bold tracking-tight">Welcome back</h1>
                <p className="text-sm text-muted-foreground mt-1">Enter your credentials to continue</p>
              </div>

              {/* Google */}
              <Button variant="outline" className="w-full gap-2" onClick={handleGoogle} type="button">
                <GoogleIcon />
                Continue with Google
              </Button>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground shrink-0">or with email</span>
                <Separator className="flex-1" />
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" type="email" placeholder="you@company.com" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="si-pw">Password</Label>
                    <button type="button" className="text-xs text-primary hover:underline">Forgot password?</button>
                  </div>
                  <div className="relative">
                    <Input id="si-pw" type={showPw ? "text" : "password"} required value={loginPw} onChange={e => setLoginPw(e.target.value)} className="pr-10" />
                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? "Signing in..." : "Sign In"}
                </Button>
              </form>

              <p className="text-xs text-muted-foreground text-center">
                Admin? Use your admin credentials to access the{" "}
                <span className="text-primary font-medium">Admin Panel</span> automatically.
              </p>
            </TabsContent>

            {/* Sign Up */}
            <TabsContent value="signup" className="space-y-5">
              <div>
                <h1 className="text-xl font-bold tracking-tight">Create an account</h1>
                <p className="text-sm text-muted-foreground mt-1">Start building with AI agents today</p>
              </div>

              {/* Google */}
              <Button variant="outline" className="w-full gap-2" onClick={handleGoogle} type="button">
                <GoogleIcon />
                Continue with Google
              </Button>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground shrink-0">or with email</span>
                <Separator className="flex-1" />
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="su-name">Full Name</Label>
                  <Input id="su-name" placeholder="John Doe" required value={regName} onChange={e => setRegName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" type="email" placeholder="you@company.com" required value={regEmail} onChange={e => setRegEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-pw">Password</Label>
                  <div className="relative">
                    <Input id="su-pw" type={showPw ? "text" : "password"} required value={regPw} onChange={e => setRegPw(e.target.value)} className="pr-10" />
                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? "Creating account..." : "Create Account"}
                </Button>
              </form>

              <p className="text-xs text-center text-muted-foreground">
                By signing up you agree to our{" "}
                <a href="#" className="text-primary hover:underline">Terms of Service</a>{" "}
                and{" "}
                <a href="#" className="text-primary hover:underline">Privacy Policy</a>.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
