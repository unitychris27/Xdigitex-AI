import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetDashboardStats, useGetDashboardActivity, useGetDashboardAgents } from "@workspace/api-client-react";
import { Activity, Bot, Folders, Zap, ArrowUpRight } from "lucide-react";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activity, isLoading: activityLoading } = useGetDashboardActivity();
  const { data: agents, isLoading: agentsLoading } = useGetDashboardAgents();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Projects</CardTitle>
            <Folders className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.projects || 0}</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              <ArrowUpRight className="w-3 h-3 mr-1 text-primary" />
              <span className="text-primary font-medium">+{stats?.projectsChange || 0}%</span> from last month
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Agents</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeAgents || 0}</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              <ArrowUpRight className="w-3 h-3 mr-1 text-primary" />
              <span className="text-primary font-medium">+{stats?.agentsChange || 0}%</span> from last month
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bots Deployed</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.botsDeployed || 0}</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              <span className="text-primary font-medium">+{stats?.botsChange || 0}%</span> from last month
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Usage</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.monthlyUsage || 0}</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              API requests this period
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 bg-card">
          <CardHeader>
            <CardTitle>Running Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {agentsLoading ? (
                <div className="text-sm text-muted-foreground">Loading agents...</div>
              ) : agents?.length === 0 ? (
                <div className="text-sm text-muted-foreground">No running agents</div>
              ) : (
                agents?.map(agent => (
                  <div key={agent.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {agent.name}
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{agent.currentTask}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{agent.progress}%</div>
                      <div className="w-24 h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${agent.progress}%` }} />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3 bg-card">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activityLoading ? (
                <div className="text-sm text-muted-foreground">Loading activity...</div>
              ) : activity?.length === 0 ? (
                <div className="text-sm text-muted-foreground">No recent activity</div>
              ) : (
                activity?.slice(0, 5).map(item => (
                  <div key={item.id} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm leading-none font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}