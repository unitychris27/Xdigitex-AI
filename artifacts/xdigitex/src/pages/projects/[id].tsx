import { useRoute } from "wouter";
import { 
  useGetProject,
  useListAgents,
  useListDeployments,
  useGetProjectLogs
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Rocket, Terminal, Settings as SettingsIcon, GitBranch, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { getGetProjectQueryKey } from "@workspace/api-client-react";

export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id ? parseInt(params.id) : 0;

  const { data: project, isLoading } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) }
  });

  const { data: agents } = useListAgents({ projectId });
  const { data: deployments } = useListDeployments({ projectId });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading project details...</div>;
  }

  if (!project) {
    return <div className="p-8 text-center text-destructive">Project not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <Link href="/projects" className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-md hover:bg-muted inline-flex">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              {project.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{project.description}</p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Bot className="w-4 h-4" /> Agents
            <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs h-5">{agents?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="deployments" className="flex items-center gap-2">
            <Rocket className="w-4 h-4" /> Deployments
            <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs h-5">{deployments?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Terminal className="w-4 h-4" /> Logs
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Repository</CardTitle>
              </CardHeader>
              <CardContent>
                {project.repositoryUrl ? (
                  <a href={project.repositoryUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                    <GitBranch className="w-4 h-4" /> GitHub Repo
                  </a>
                ) : (
                  <span className="text-muted-foreground text-sm">Not linked</span>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Deployment Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-medium flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${project.deploymentStatus === 'deployed' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  {project.deploymentStatus || "Not deployed"}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="agents">
          <Card>
            <CardHeader>
              <CardTitle>Project Agents</CardTitle>
            </CardHeader>
            <CardContent>
              {agents?.length ? (
                <div className="space-y-4">
                  {agents.map(agent => (
                    <div key={agent.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="font-medium">{agent.name}</div>
                        <div className="text-sm text-muted-foreground capitalize">{agent.type.replace('_', ' ')}</div>
                      </div>
                      <Badge variant={agent.status === 'running' ? 'default' : 'secondary'}>
                        {agent.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No agents assigned to this project</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deployments">
           <Card>
            <CardHeader>
              <CardTitle>Deployments</CardTitle>
            </CardHeader>
            <CardContent>
              {deployments?.length ? (
                <div className="space-y-4">
                  {deployments.map(dep => (
                    <div key={dep.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {dep.environment}
                          <Badge variant="outline">{dep.version}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">Provider: {dep.provider}</div>
                      </div>
                      <div className="text-right">
                         <Badge variant={dep.status === 'success' ? 'default' : 'destructive'}>
                          {dep.status}
                        </Badge>
                        {dep.url && (
                          <div className="mt-2 text-sm">
                            <a href={dep.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">View live</a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No deployments found</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Project Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-black/90 text-green-400 p-4 rounded-md font-mono text-xs h-96 overflow-y-auto">
                <div>[INFO] Project initialized</div>
                <div>[INFO] Repository connected</div>
                <div className="text-yellow-400">[WARN] No agents active</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Project Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">Settings configuration here...</div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}