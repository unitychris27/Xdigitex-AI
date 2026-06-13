import { useRoute } from "wouter";
import { useGetBot, useGetBotAnalytics } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquare, Activity, Settings, Terminal, BarChart } from "lucide-react";
import { Link } from "wouter";
import { getGetBotQueryKey, getGetBotAnalyticsQueryKey } from "@workspace/api-client-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function BotDetail() {
  const [, params] = useRoute("/bots/:id");
  const botId = params?.id ? parseInt(params.id) : 0;

  const { data: bot, isLoading: botLoading } = useGetBot(botId, {
    query: { enabled: !!botId, queryKey: getGetBotQueryKey(botId) }
  });

  const { data: analytics } = useGetBotAnalytics(botId, {
    query: { enabled: !!botId, queryKey: getGetBotAnalyticsQueryKey(botId) }
  });

  if (botLoading) return <div className="p-8 text-center text-muted-foreground">Loading bot details...</div>;
  if (!bot) return <div className="p-8 text-center text-destructive">Bot not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Link href="/bots" className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-md hover:bg-muted inline-flex">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{bot.name}</h1>
              <Badge variant="outline" className={bot.status === 'active' ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-muted"}>
                {bot.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{bot.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Redeploy</Button>
          <Button>Edit Bot</Button>
        </div>
      </div>

      <Tabs defaultValue="analytics" className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="analytics" className="flex items-center gap-2"><BarChart className="w-4 h-4" /> Analytics</TabsTrigger>
          <TabsTrigger value="configuration" className="flex items-center gap-2"><Settings className="w-4 h-4" /> Configuration</TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2"><Terminal className="w-4 h-4" /> Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics?.totalUsers || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Messages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics?.totalMessages || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics?.activeUsers || 0}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daily Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                {analytics?.dailyMessages ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.dailyMessages}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="date" stroke="#888" />
                      <YAxis stroke="#888" />
                      <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} />
                      <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuration">
           <Card>
            <CardHeader>
              <CardTitle>Configuration Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Configuration options will appear here.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
           <Card>
            <CardHeader>
              <CardTitle>Execution Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-black/90 text-green-400 p-4 rounded-md font-mono text-xs h-96 overflow-y-auto">
                <div>[INFO] Bot started</div>
                <div>[INFO] Connected to Telegram API</div>
                <div>[INFO] Processing incoming messages...</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}