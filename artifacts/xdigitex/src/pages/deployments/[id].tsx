import { useRoute } from "wouter";
import { useGetDeployment, useGetDeploymentLogs } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Rocket, Server, Terminal, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { getGetDeploymentQueryKey, getGetDeploymentLogsQueryKey } from "@workspace/api-client-react";

export default function DeploymentDetail() {
  const [, params] = useRoute("/deployments/:id");
  const deploymentId = params?.id ? parseInt(params.id) : 0;

  const { data: deployment, isLoading: depLoading } = useGetDeployment(deploymentId, {
    query: { enabled: !!deploymentId, queryKey: getGetDeploymentQueryKey(deploymentId) }
  });

  const { data: logs } = useGetDeploymentLogs(deploymentId, {
    query: { enabled: !!deploymentId, queryKey: getGetDeploymentLogsQueryKey(deploymentId) }
  });

  if (depLoading) return <div className="p-8 text-center text-muted-foreground">Loading deployment...</div>;
  if (!deployment) return <div className="p-8 text-center text-destructive">Deployment not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Link href="/deployments" className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-md hover:bg-muted inline-flex">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Deployment #{deployment.id}</h1>
              <Badge variant="outline" className={deployment.status === 'success' ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-muted"}>
                {deployment.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-3">
              <span>Environment: <strong className="text-foreground capitalize">{deployment.environment}</strong></span>
              <span>Provider: <strong className="text-foreground">{deployment.provider}</strong></span>
              <span>Version: <strong className="text-foreground">{deployment.version}</strong></span>
            </p>
          </div>
        </div>
        {deployment.url && (
          <a href={deployment.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
            Visit URL <ExternalLink className="w-4 h-4 ml-2" />
          </a>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="py-3 px-4 border-b bg-muted/30">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Terminal className="w-4 h-4" /> Build Logs
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 bg-black/95 text-green-400 font-mono text-xs overflow-y-auto">
              <div className="p-4 space-y-1">
                {logs ? logs.map(log => (
                  <div key={log.id} className={log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : ''}>
                    <span className="text-gray-500 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    {log.message}
                  </div>
                )) : (
                  <div>Waiting for logs...</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Build Time</span>
                <span className="font-medium">1m 24s</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">{new Date(deployment.createdAt).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}