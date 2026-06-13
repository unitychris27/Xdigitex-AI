import { useState } from "react";
import { Link } from "wouter";
import { 
  useListProjects, 
  useCreateProject 
} from "@workspace/api-client-react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  FolderKanban, 
  Search, 
  Plus, 
  LayoutGrid, 
  List, 
  MoreVertical,
  Bot,
  Rocket
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import { toast } from "sonner";

export default function Projects() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");

  const queryClient = useQueryClient();

  const { data: projects, isLoading } = useListProjects({ 
    search: search || undefined, 
    status: status !== "all" ? status : undefined 
  });

  const createMutation = useCreateProject();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      data: { name: newProjectName, description: newProjectDesc }
    }, {
      onSuccess: () => {
        toast.success("Project created successfully");
        setIsCreateOpen(false);
        setNewProjectName("");
        setNewProjectDesc("");
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      },
      onError: () => {
        toast.error("Failed to create project");
      }
    });
  };

  const statusColors: Record<string, string> = {
    active: "bg-green-500/10 text-green-500 hover:bg-green-500/20",
    paused: "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20",
    completed: "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20",
    archived: "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">Manage your AI workspaces and deployments</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Set up a new workspace for your AI agents and deployments.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name</Label>
                <Input 
                  id="name" 
                  placeholder="e.g. Acme Backend Migration" 
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input 
                  id="description" 
                  placeholder="Briefly describe the project goals" 
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Project"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center bg-muted/50 p-1 rounded-md border border-border">
          <Button 
            variant={view === "grid" ? "secondary" : "ghost"} 
            size="icon" 
            className="h-8 w-8"
            onClick={() => setView("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button 
            variant={view === "list" ? "secondary" : "ghost"} 
            size="icon" 
            className="h-8 w-8"
            onClick={() => setView("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading projects...</div>
      ) : projects?.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <FolderKanban className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No projects found</h3>
          <p className="text-sm text-muted-foreground mt-1">Get started by creating your first project.</p>
          <Button className="mt-4" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>
      ) : (
        <div className={view === "grid" ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3" : "space-y-4"}>
          {projects?.map(project => (
            <Link key={project.id} href={`/projects/${project.id}`} className="block">
                <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer bg-card/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {project.name}
                        </CardTitle>
                        <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                          {project.description}
                        </CardDescription>
                      </div>
                      <Badge className={statusColors[project.status] || "bg-muted text-muted-foreground"} variant="secondary">
                        {project.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground pt-4 border-t border-border/50">
                      <div className="flex items-center gap-1.5">
                        <Bot className="w-4 h-4" />
                        <span>{project.agentCount || 0} agents</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Rocket className="w-4 h-4" />
                        <span>{project.deploymentCount || 0} deploys</span>
                      </div>
                      <div className="flex-1 text-right text-xs">
                        Updated {new Date(project.lastActivity || project.createdAt).toLocaleDateString()}
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