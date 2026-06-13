import { useListAgents } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Activity, Settings2, Play, Square, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AgentsList() {
  const { data: agents, isLoading } = useListAgents();

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'running': return <Play className="w-3 h-3 text-green-500" />;
      case 'idle': return <Pause className="w-3 h-3 text-yellow-500" />;
      case 'completed': return <Square className="w-3 h-3 text-blue-500" />;
      case 'failed': return <Square className="w-3 h-3 text-red-500" />;
      default: return <Activity className="w-3 h-3" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'running': return "bg-green-500/10 text-green-500 border-green-500/20";
      case 'idle': return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case 'completed': return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case 'failed': return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Agents</h1>
          <p className="text-sm text-muted-foreground">Manage your autonomous agents across all projects</p>
        </div>
        <Button>Deploy Agent</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading agents...</div>
      ) : agents?.length === 0 ? (
         <div className="text-center py-12 border border-dashed rounded-lg">
          <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No agents found</h3>
          <p className="text-sm text-muted-foreground mt-1">Deploy an agent to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents?.map(agent => (
            <Card key={agent.id} className="bg-card/50 hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Bot className="w-5 h-5 text-primary" />
                      {agent.name}
                    </CardTitle>
                    <div className="text-sm text-muted-foreground capitalize">
                      {agent.type.replace('_', ' ')}
                    </div>
                  </div>
                  <Badge variant="outline" className={`capitalize flex items-center gap-1.5 ${getStatusColor(agent.status)}`}>
                    {getStatusIcon(agent.status)}
                    {agent.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {agent.task && (
                    <div className="text-sm p-3 bg-muted/30 rounded-md border border-border">
                      <span className="font-medium block mb-1">Current Task:</span>
                      <span className="text-muted-foreground">{agent.task}</span>
                    </div>
                  )}
                  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span>Progress</span>
                      <span>{agent.progress || 0}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${agent.status === 'failed' ? 'bg-red-500' : 'bg-primary'}`}
                        style={{ width: `${agent.progress || 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border/50">
                    <div className="flex items-center gap-1.5">
                      <Settings2 className="w-3.5 h-3.5" />
                      {agent.model || 'Default Model'}
                    </div>
                    <div>
                      {agent.runtime ? `${Math.floor(agent.runtime / 60)}m ${agent.runtime % 60}s` : '0m 0s'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}