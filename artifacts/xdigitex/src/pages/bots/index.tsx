import { useListBots, useCreateBot } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Users, Activity, Plus } from "lucide-react";
import { Link } from "wouter";

export default function BotsList() {
  const { data: bots, isLoading } = useListBots();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return "bg-green-500/10 text-green-500 border-green-500/20";
      case 'inactive': return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      case 'deploying': return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case 'error': return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Telegram Bots</h1>
          <p className="text-sm text-muted-foreground">Manage your AI-powered Telegram bots</p>
        </div>
        <Button asChild>
          <Link href="/bots/new">
            <Plus className="w-4 h-4 mr-2" />
            Create Bot
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading bots...</div>
      ) : bots?.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No bots found</h3>
          <p className="text-sm text-muted-foreground mt-1">Create your first Telegram bot to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bots?.map(bot => (
            <Link key={bot.id} href={`/bots/${bot.id}`} className="block">
                <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer bg-card/50">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{bot.name}</CardTitle>
                      <Badge variant="outline" className={getStatusColor(bot.status)}>
                        {bot.status}
                      </Badge>
                    </div>
                    {bot.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-2">{bot.description}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground pt-4 border-t border-border/50">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4" />
                        <span>{bot.users || 0} users</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-4 h-4" />
                        <span>{bot.messages || 0} msgs</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-4 h-4" />
                        <span>{bot.deployments || 0} deploys</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}