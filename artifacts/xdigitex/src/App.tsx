import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/providers/ThemeProvider";
import NotFound from "@/pages/not-found";

import { Shell } from "@/components/layout/Shell";
import Dashboard from "@/pages/dashboard";
import Login from "@/pages/login";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/projects/[id]";
import Workspace from "@/pages/workspace";
import AgentsList from "@/pages/agents";
import BotsList from "@/pages/bots";
import NewBot from "@/pages/bots/new";
import BotDetail from "@/pages/bots/[id]";
import DeploymentsList from "@/pages/deployments";
import DeploymentDetail from "@/pages/deployments/[id]";
import ServersList from "@/pages/servers";
import Billing from "@/pages/billing";
import Secrets from "@/pages/secrets";
import Referrals from "@/pages/referrals";
import Promotions from "@/pages/promotions";
import Marketplace from "@/pages/marketplace";
import Analytics from "@/pages/analytics";
import Notifications from "@/pages/notifications";
import Settings from "@/pages/settings";
import Team from "@/pages/team";
import Admin from "@/pages/admin";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/dashboard" />} />
      <Route path="/login" component={Login} />
      
      {/* Wrapped routes */}
      <Route path="/:rest*">
        <Shell>
          <Switch>
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/projects" component={Projects} />
            <Route path="/projects/:id" component={ProjectDetail} />
            <Route path="/workspace" component={Workspace} />
            <Route path="/agents" component={AgentsList} />
            
            <Route path="/bots" component={BotsList} />
            <Route path="/bots/new" component={NewBot} />
            <Route path="/bots/:id" component={BotDetail} />
            
            <Route path="/deployments" component={DeploymentsList} />
            <Route path="/deployments/:id" component={DeploymentDetail} />
            
            <Route path="/servers" component={ServersList} />
            <Route path="/secrets" component={Secrets} />
            <Route path="/billing" component={Billing} />
            <Route path="/referrals" component={Referrals} />
            <Route path="/promotions" component={Promotions} />
            <Route path="/marketplace" component={Marketplace} />
            <Route path="/analytics" component={Analytics} />
            <Route path="/notifications" component={Notifications} />
            <Route path="/settings" component={Settings} />
            <Route path="/team" component={Team} />
            <Route path="/admin" component={Admin} />
            <Route component={NotFound} />
          </Switch>
        </Shell>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="xdigitex-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;