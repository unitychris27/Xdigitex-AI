import { useState } from "react";
import { useGetBillingOverview, useListInvoices } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, Download, Activity, Zap, HardDrive, Tag, CheckCircle2, Rocket, Star, Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 9,
    currency: "USD",
    period: "month",
    icon: Zap,
    color: "border-border/50",
    features: ["50,000 AI tokens / month", "5 published projects", "1 GB storage", "Community support"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    currency: "USD",
    period: "month",
    icon: Star,
    color: "border-primary/40 bg-primary/5",
    badge: "Most Popular",
    features: ["500,000 AI tokens / month", "Unlimited projects", "20 GB storage", "Referral rewards", "Priority support"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 99,
    currency: "USD",
    period: "month",
    icon: Crown,
    color: "border-border/50",
    features: ["Unlimited AI tokens", "Unlimited projects", "100 GB storage", "Custom domain", "Dedicated support"],
  },
];

export default function Billing() {
  const { data: overview, isLoading: overviewLoading } = useGetBillingOverview();
  const { data: invoices, isLoading: invoicesLoading } = useListInvoices();

  const [promoCode, setPromoCode]     = useState("");
  const [promoApplying, setPromoApplying] = useState(false);
  const [appliedPromos, setAppliedPromos] = useState<{ code: string; discount: string; status: string }[]>([]);

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoApplying(true);
    try {
      const res = await fetch("/api/billing/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim().toUpperCase() }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? "Invalid promo code");
      }
      const data = await res.json() as { discount: string; message: string };
      setAppliedPromos(p => [...p, { code: promoCode.trim().toUpperCase(), discount: data.discount, status: "active" }]);
      setPromoCode("");
      toast.success(data.message ?? "Promo code applied!");
    } catch (e: any) {
      toast.error(e.message ?? "Could not apply promo code");
    } finally {
      setPromoApplying(false);
    }
  };

  const handleUpgrade = (planId: string) => {
    toast.info("Pesapal payment integration coming soon — credentials pending.");
  };

  const tokenPct = Math.min(100, ((overview?.tokenUsage ?? 0) / (overview?.tokenLimit ?? 1)) * 100);
  const storagePct = Math.min(100, ((overview?.storageUsage ?? 0) / (overview?.storageLimit ?? 1)) * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing & Usage</h1>
          <p className="text-sm text-muted-foreground">Manage your subscription, usage, and invoices</p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1 capitalize">
          {overview?.plan ?? "Free"} Plan
        </Badge>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plans">Upgrade</TabsTrigger>
          <TabsTrigger value="promo">Promo Codes</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        {/* ── Overview ──────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Current Plan</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize">{overview?.plan ?? "Free"}</div>
                <p className="text-xs text-muted-foreground mt-1">${overview?.monthlyCost ?? 0} / month</p>
                <Button variant="link" className="w-full mt-4 h-8 text-primary" onClick={() => handleUpgrade("pro")}>
                  Upgrade Plan
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">AI Token Usage</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(overview?.tokenUsage ?? 0).toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">of {(overview?.tokenLimit ?? 0).toLocaleString()} limit</p>
                <div className="w-full bg-muted h-1.5 mt-4 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${tokenPct > 80 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${tokenPct}%` }} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">API Requests</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(overview?.apiRequests ?? 0).toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">this billing cycle</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Storage</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.storageUsage ?? 0} GB</div>
                <p className="text-xs text-muted-foreground mt-1">of {overview?.storageLimit ?? 0} GB limit</p>
                <div className="w-full bg-muted h-1.5 mt-4 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${storagePct > 80 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${storagePct}%` }} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Upgrade / Plans ───────────────────────────────────────────────── */}
        <TabsContent value="plans" className="mt-6">
          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map(plan => {
              const Icon = plan.icon;
              const current = (overview?.plan ?? "free").toLowerCase() === plan.id;
              return (
                <Card key={plan.id} className={`relative flex flex-col ${plan.color}`}>
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground text-[10px] px-3">{plan.badge}</Badge>
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <CardTitle className="text-base">{plan.name}</CardTitle>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">${plan.price}</span>
                      <span className="text-sm text-muted-foreground">/{plan.period}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-4">
                    <ul className="space-y-2">
                      {plan.features.map(f => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {current ? (
                      <Button className="w-full" disabled variant="outline">Current Plan</Button>
                    ) : (
                      <Button className="w-full gap-2" onClick={() => handleUpgrade(plan.id)}>
                        <Rocket className="w-4 h-4" /> Upgrade to {plan.name}
                      </Button>
                    )}
                    <p className="text-[10px] text-center text-muted-foreground">Secure payment via Pesapal</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border/40 text-sm text-muted-foreground text-center">
            Payments processed securely by <a href="https://www.pesapal.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Pesapal</a> — M-Pesa, Visa, Mastercard, and more accepted.
          </div>
        </TabsContent>

        {/* ── Promo Codes ───────────────────────────────────────────────────── */}
        <TabsContent value="promo" className="mt-6 space-y-6 max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Tag className="w-4 h-4 text-primary" /> Apply Promo Code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Enter a promo code to get a discount on your next payment. Codes are set by the XDIGITEX admin team.</p>
              <div className="flex gap-2">
                <Input
                  value={promoCode}
                  onChange={e => setPromoCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && applyPromo()}
                  placeholder="e.g. LAUNCH50"
                  className="font-mono tracking-widest"
                  maxLength={20}
                />
                <Button onClick={applyPromo} disabled={!promoCode.trim() || promoApplying} className="shrink-0 gap-1.5">
                  {promoApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
                  Apply
                </Button>
              </div>

              {appliedPromos.length > 0 && (
                <div className="space-y-2 border-t border-border/40 pt-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Applied Codes</p>
                  {appliedPromos.map(p => (
                    <div key={p.code} className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        <span className="font-mono font-semibold text-sm">{p.code}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-green-400">{p.discount} off</span>
                        <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">{p.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Invoices ──────────────────────────────────────────────────────── */}
        <TabsContent value="invoices" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Invoice History</CardTitle>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="text-center py-4 text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading invoices…
                </div>
              ) : !invoices?.length ? (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg space-y-2">
                  <CreditCard className="w-8 h-8 mx-auto opacity-20" />
                  <p className="text-sm">No invoices yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {invoices.map(invoice => (
                    <div key={invoice.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary/10 text-primary rounded flex items-center justify-center">
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-medium">{new Date(invoice.date).toLocaleDateString()}</div>
                          <div className="text-sm text-muted-foreground">Invoice #{invoice.id}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="font-medium">${invoice.amount}</div>
                        <Badge variant={invoice.status === "paid" ? "default" : "secondary"}>{invoice.status}</Badge>
                        <Button variant="ghost" size="icon"><Download className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
