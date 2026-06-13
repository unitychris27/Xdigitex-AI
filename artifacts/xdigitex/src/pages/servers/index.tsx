import { useListServers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Server, Cpu, HardDrive, Activity, Plus } from "lucide-react";

export default function ServersList() {
  const { data: servers, isLoading } = useListServers();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return "bg-green-500/10 text-green-500 border-green-500/20";
      case 'offline': return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      case 'connecting': return "bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse";
      case 'error': return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Servers</h1>
          <p className="text-sm text-muted-foreground">Manage your SSH connections and server infrastructure</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Server
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading servers...</div>
      ) : servers?.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No servers configured</h3>
          <p className="text-sm text-muted-foreground mt-1">Connect your first server via SSH.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {servers?.map(server => (
            <Card key={server.id} className="bg-card/50">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-primary" />
                    <CardTitle className="text-lg">{server.name}</CardTitle>
                  </div>
                  <Badge variant="outline" className={getStatusColor(server.status)}>
                    {server.status}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-2 flex items-center justify-between">
                  <span>{server.provider}</span>
                  <span>{server.location}</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-black/50 rounded-md p-3 font-mono text-xs text-muted-foreground flex justify-between items-center mb-4 border border-border">
                  <span>{server.username}@{server.host || "unknown-host"}</span>
                  <span>port {server.port || 22}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 bg-muted/30 rounded border border-border">
                    <Cpu className="w-4 h-4 mx-auto mb-1 text-primary" />
                    <span className="text-muted-foreground">CPU</span>
                    <div className="font-medium mt-0.5">--</div>
                  </div>
                  <div className="p-2 bg-muted/30 rounded border border-border">
                    <HardDrive className="w-4 h-4 mx-auto mb-1 text-primary" />
                    <span className="text-muted-foreground">RAM</span>
                    <div className="font-medium mt-0.5">--</div>
                  </div>
                  <div className="p-2 bg-muted/30 rounded border border-border">
                    <Activity className="w-4 h-4 mx-auto mb-1 text-primary" />
                    <span className="text-muted-foreground">Net</span>
                    <div className="font-medium mt-0.5">--</div>
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