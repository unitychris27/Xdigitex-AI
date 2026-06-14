import { useState, useEffect } from "react";
import { useListTemplates } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Store, Search, Download, Star, Upload, Globe, ExternalLink, Tag, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

const WS_KEY = "xdx_workspace_v6";

type GeneratedFile = { name: string; content: string; language: string };
type BuildRecord   = { id: string; prompt: string; mode: string; files: GeneratedFile[]; builtAt: string; version: number };
type DeployedSite  = { id: string; name: string; url: string; publicUrl?: string; deployedAt: string };

type MarketListing = {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  stack: string;
  publishedUrl?: string;
  publishedAt: string;
};

const MKT_KEY = "xdx_marketplace_listings";

function loadListings(): MarketListing[] {
  try { return JSON.parse(localStorage.getItem(MKT_KEY) ?? "[]"); } catch { return []; }
}
function saveListings(l: MarketListing[]) { localStorage.setItem(MKT_KEY, JSON.stringify(l)); }

export default function Marketplace() {
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState<string | undefined>(undefined);
  const { data: templates, isLoading } = useListTemplates({ search: search || undefined, category });

  // Publish form
  const [builds, setBuilds]             = useState<BuildRecord[]>([]);
  const [deployments, setDeployments]   = useState<DeployedSite[]>([]);
  const [listings, setListings]         = useState<MarketListing[]>([]);
  const [selBuild, setSelBuild]         = useState<string>("");
  const [pubTitle, setPubTitle]         = useState("");
  const [pubDesc, setPubDesc]           = useState("");
  const [pubPrice, setPubPrice]         = useState("0");
  const [pubCategory, setPubCategory]   = useState("saas_apps");
  const [publishing, setPublishing]     = useState(false);

  useEffect(() => {
    try {
      const ws = JSON.parse(localStorage.getItem(WS_KEY) ?? "{}");
      setBuilds(ws.buildHistory ?? []);
      setDeployments(ws.deployments ?? []);
    } catch {}
    setListings(loadListings());
  }, []);

  const selectedBuild = builds.find(b => b.id === selBuild);

  const handlePublish = async () => {
    if (!pubTitle.trim()) { toast.error("Enter a title"); return; }
    if (!selectedBuild) { toast.error("Select a build to publish"); return; }
    setPublishing(true);
    await new Promise(r => setTimeout(r, 600));
    const dep = deployments.find(d => d.name.toLowerCase().includes(selectedBuild.prompt.slice(0, 15).toLowerCase()));
    const listing: MarketListing = {
      id: Date.now().toString(36),
      title: pubTitle.trim(),
      description: pubDesc.trim() || selectedBuild.prompt,
      price: parseFloat(pubPrice) || 0,
      category: pubCategory,
      stack: selectedBuild.mode,
      publishedUrl: dep?.publicUrl ?? dep?.url,
      publishedAt: new Date().toLocaleString(),
    };
    const updated = [listing, ...listings];
    setListings(updated);
    saveListings(updated);
    toast.success("Published to marketplace!");
    setSelBuild(""); setPubTitle(""); setPubDesc(""); setPubPrice("0");
    setPublishing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-10 bg-card rounded-lg border border-border">
        <Store className="w-12 h-12 text-primary mb-3" />
        <h1 className="text-3xl font-bold tracking-tight mb-2">Project Marketplace</h1>
        <p className="text-muted-foreground max-w-lg text-center mb-6">
          Discover production-ready templates, or publish your own projects and set a price.
        </p>
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10 h-10 w-full bg-background" placeholder="Search templates…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse">Browse Templates</TabsTrigger>
          <TabsTrigger value="publish">Publish Your Project</TabsTrigger>
          <TabsTrigger value="my">My Listings {listings.length > 0 && `(${listings.length})`}</TabsTrigger>
        </TabsList>

        {/* ── Browse ─────────────────────────────────────────────────────── */}
        <TabsContent value="browse" className="mt-6">
          <Tabs defaultValue="all" onValueChange={v => setCategory(v === "all" ? undefined : v)}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="telegram_bots">Telegram Bots</TabsTrigger>
              <TabsTrigger value="ai_agents">AI Agents</TabsTrigger>
              <TabsTrigger value="saas_apps">SaaS Apps</TabsTrigger>
              <TabsTrigger value="automation_workflows">Workflows</TabsTrigger>
            </TabsList>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {isLoading ? (
                <div className="col-span-full text-center py-12 text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
                </div>
              ) : !templates?.length ? (
                <div className="col-span-full text-center py-12 border border-dashed rounded-lg">
                  <p className="text-muted-foreground">No templates found.</p>
                </div>
              ) : (
                templates.map(t => (
                  <Card key={t.id} className="flex flex-col overflow-hidden hover:border-primary/50 transition-colors">
                    <div className="aspect-video bg-muted flex items-center justify-center text-muted-foreground">
                      {t.imageUrl ? <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" /> : <Store className="w-10 h-10 opacity-20" />}
                    </div>
                    <CardHeader className="p-4 pb-0">
                      <div className="flex justify-between items-start">
                        <Badge variant="secondary" className="text-[10px] uppercase">{t.category.replace("_", " ")}</Badge>
                        <div className="flex items-center text-yellow-500 text-xs font-medium">
                          <Star className="w-3 h-3 fill-current mr-1" />{t.rating}
                        </div>
                      </div>
                      <CardTitle className="text-base mt-2 line-clamp-1">{t.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 py-2 flex-1">
                      <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                    </CardContent>
                    <CardFooter className="p-4 pt-0 flex items-center justify-between border-t border-border mt-4 pt-4">
                      <div className="text-sm font-semibold">{t.price === 0 ? "Free" : `$${t.price}`}</div>
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-muted-foreground flex items-center"><Download className="w-3 h-3 mr-1" />{t.downloads}</div>
                        <Button size="sm">Install</Button>
                      </div>
                    </CardFooter>
                  </Card>
                ))
              )}
            </div>
          </Tabs>
        </TabsContent>

        {/* ── Publish ────────────────────────────────────────────────────── */}
        <TabsContent value="publish" className="mt-6">
          <div className="max-w-2xl space-y-6">
            {builds.length === 0 ? (
              <Card className="bg-card/50 border-dashed">
                <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                  <Package className="w-10 h-10 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No builds found. Build a project in the AI Workspace first.</p>
                  <Link href="/workspace"><Button className="gap-1.5"><ExternalLink className="w-4 h-4" /> Go to Workspace</Button></Link>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="w-4 h-4 text-primary" /> Publish a Project</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Select Build</label>
                    <select value={selBuild} onChange={e => { setSelBuild(e.target.value); const b = builds.find(x => x.id === e.target.value); if (b) setPubTitle(b.prompt.slice(0, 60)); }}
                      className="w-full bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50">
                      <option value="">— choose a build —</option>
                      {builds.map(b => <option key={b.id} value={b.id}>v{b.version} · {b.prompt.slice(0, 50)} ({b.builtAt})</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Listing Title</label>
                    <Input value={pubTitle} onChange={e => setPubTitle(e.target.value)} placeholder="e.g. SaaS Invoicing Platform" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</label>
                    <textarea value={pubDesc} onChange={e => setPubDesc(e.target.value)} rows={3} placeholder="What does this project do? What's included?"
                      className="w-full bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</label>
                      <select value={pubCategory} onChange={e => setPubCategory(e.target.value)}
                        className="w-full bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50">
                        <option value="saas_apps">SaaS App</option>
                        <option value="telegram_bots">Telegram Bot</option>
                        <option value="ai_agents">AI Agent</option>
                        <option value="automation_workflows">Workflow</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Price (USD)</label>
                      <div className="relative">
                        <Tag className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                        <Input type="number" min="0" step="1" value={pubPrice} onChange={e => setPubPrice(e.target.value)} className="pl-9" placeholder="0 = free" />
                      </div>
                    </div>
                  </div>
                  <Button className="w-full gap-2" onClick={handlePublish} disabled={!selBuild || !pubTitle.trim() || publishing}>
                    {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {publishing ? "Publishing…" : "Publish to Marketplace"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── My Listings ────────────────────────────────────────────────── */}
        <TabsContent value="my" className="mt-6">
          {listings.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
              <Globe className="w-10 h-10 opacity-20" />
              <p className="text-sm">You haven't published anything yet.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {listings.map(l => (
                <Card key={l.id} className="flex flex-col hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <Badge variant="secondary" className="text-[10px] uppercase">{l.category.replace("_", " ")}</Badge>
                      <div className="text-sm font-bold text-primary">{l.price === 0 ? "Free" : `$${l.price}`}</div>
                    </div>
                    <CardTitle className="text-base mt-2 line-clamp-1">{l.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="text-sm text-muted-foreground line-clamp-2">{l.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-3">Published {l.publishedAt}</p>
                  </CardContent>
                  <CardFooter className="border-t border-border pt-3 gap-2">
                    {l.publishedUrl && (
                      <a href={l.publishedUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs">
                          <Globe className="w-3 h-3" /> View Live
                        </Button>
                      </a>
                    )}
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-400 text-xs"
                      onClick={() => { const u = listings.filter(x => x.id !== l.id); setListings(u); saveListings(u); toast.success("Listing removed"); }}>
                      Remove
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
