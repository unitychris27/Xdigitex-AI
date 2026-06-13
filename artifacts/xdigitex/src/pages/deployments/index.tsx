import { useListDeployments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Rocket, Server, ExternalLink } from "lucide-react";
import { Link } from "wouter";

export default function DeploymentsList() {
  const { data: deployments, isLoading } = useListDeployments();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return "bg-green-500/10 text-green-500 border-green-500/20";
      case 'failed': return "bg-red-500/10 text-red-500 border-red-500/20";
      case 'deploying': return "bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse";
      case 'pending': return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deployments</h1>
          <p className="text-sm text-muted-foreground">Monitor and manage all your deployments</p>
        </div>
        <Button>New Deployment</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading deployments...</div>
      ) : deployments?.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <Rocket className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No deployments</h3>
          <p className="text-sm text-muted-foreground mt-1">You haven't deployed any projects yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {deployments?.map(dep => (
            <Card key={dep.id} className="bg-card/50">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Rocket className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/deployments/${dep.id}`} className="font-semibold text-lg hover:underline">
                        Deployment #{dep.id}
                      </Link>
                      <Badge variant="outline" className={getStatusColor(dep.status)}>
                        {dep.status}
                      </Badge>
                      <Badge variant="secondary" className="capitalize">{dep.environment}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1"><Server className="w-3.5 h-3.5" /> {dep.provider}</span>
                      <span>Version: {dep.version}</span>
                      <span>Project ID: {dep.projectId || "None"}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm text-muted-foreground">
                    <div>{new Date(dep.createdAt).toLocaleString()}</div>
                  </div>
                  {dep.url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={dep.url} target="_blank" rel="noopener noreferrer">
                        Visit <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}