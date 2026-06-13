import { useState } from "react";
import { useListTemplates } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Store, Search, Download, Star } from "lucide-react";

export default function Marketplace() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>(undefined);

  const { data: templates, isLoading } = useListTemplates({ search: search || undefined, category });

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-12 bg-card rounded-lg border border-border">
        <Store className="w-12 h-12 text-primary mb-4" />
        <h1 className="text-3xl font-bold tracking-tight mb-2">Template Marketplace</h1>
        <p className="text-muted-foreground max-w-lg text-center mb-8">
          Kickstart your projects with production-ready AI agent templates, telegram bots, and automation workflows.
        </p>
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            className="pl-10 h-10 w-full bg-background" 
            placeholder="Search templates..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Tabs defaultValue="all" onValueChange={(v) => setCategory(v === 'all' ? undefined : v)}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">All Templates</TabsTrigger>
          <TabsTrigger value="telegram_bots">Telegram Bots</TabsTrigger>
          <TabsTrigger value="ai_agents">AI Agents</TabsTrigger>
          <TabsTrigger value="saas_apps">SaaS Apps</TabsTrigger>
          <TabsTrigger value="automation_workflows">Workflows</TabsTrigger>
        </TabsList>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isLoading ? (
            <div className="col-span-full text-center py-12 text-muted-foreground">Loading templates...</div>
          ) : templates?.length === 0 ? (
            <div className="col-span-full text-center py-12 border border-dashed rounded-lg">
              <p className="text-muted-foreground">No templates found matching your criteria.</p>
            </div>
          ) : (
            templates?.map(template => (
              <Card key={template.id} className="flex flex-col overflow-hidden hover:border-primary/50 transition-colors">
                <div className="aspect-video bg-muted flex items-center justify-center text-muted-foreground">
                  {template.imageUrl ? (
                    <img src={template.imageUrl} alt={template.name} className="w-full h-full object-cover" />
                  ) : (
                    <Store className="w-10 h-10 opacity-20" />
                  )}
                </div>
                <CardHeader className="p-4 pb-0">
                  <div className="flex justify-between items-start">
                    <Badge variant="secondary" className="text-[10px] uppercase">{template.category.replace('_', ' ')}</Badge>
                    <div className="flex items-center text-yellow-500 text-xs font-medium">
                      <Star className="w-3 h-3 fill-current mr-1" />
                      {template.rating}
                    </div>
                  </div>
                  <CardTitle className="text-base mt-2 line-clamp-1">{template.name}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 py-2 flex-1">
                  <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
                </CardContent>
                <CardFooter className="p-4 pt-0 flex items-center justify-between border-t border-border mt-4 pt-4">
                  <div className="text-sm font-semibold">
                    {template.price === 0 ? "Free" : `$${template.price}`}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-muted-foreground flex items-center">
                      <Download className="w-3 h-3 mr-1" /> {template.downloads}
                    </div>
                    <Button size="sm">Install</Button>
                  </div>
                </CardFooter>
              </Card>
            ))
          )}
        </div>
      </Tabs>
    </div>
  );
}