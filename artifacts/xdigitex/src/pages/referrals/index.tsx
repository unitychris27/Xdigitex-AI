import { useGetReferrals, useListReferrals } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Gift, Copy, Users, DollarSign, TrendingUp, Lock } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

const SITE_URL = "https://xdigitex.ai";

export default function Referrals() {
  const { data: dashboard, isLoading: dashLoading } = useGetReferrals();
  const { data: referrals, isLoading: refLoading } = useListReferrals();

  const isPaid = dashboard && (dashboard as any).plan && (dashboard as any).plan !== "free";
  const referralCode = (dashboard as any)?.referralCode ?? "YOUR_CODE";
  const referralLink = `${SITE_URL}/r/${referralCode}`;

  const handleCopy = () => {
    if (!isPaid) { toast.error("Upgrade to a paid plan to access referral rewards"); return; }
    navigator.clipboard.writeText(referralLink);
    toast.success("Referral link copied!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
          <p className="text-sm text-muted-foreground">Invite developers — earn credits when they upgrade</p>
        </div>
        {!isPaid && (
          <Link href="/billing">
            <Button size="sm" className="gap-1.5"><Lock className="w-3.5 h-3.5" /> Upgrade to unlock</Button>
          </Link>
        )}
      </div>

      {/* Referral link card */}
      <Card className={`${isPaid ? "bg-primary/5 border-primary/20" : "opacity-60 border-dashed"}`}>
        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex-1 w-full">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold">Your Referral Link</h3>
              {!isPaid && (
                <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/40 text-amber-400">
                  <Lock className="w-2.5 h-2.5" /> Paid plan only
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Share this link — friends get <strong>$50 in credits</strong>, you get <strong>$50</strong> when they upgrade to a paid plan.
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={isPaid ? referralLink : `${SITE_URL}/r/••••••••`}
                readOnly
                className="font-mono text-sm bg-background w-full max-w-sm"
              />
              <Button onClick={handleCopy} disabled={!isPaid} className="gap-1.5 shrink-0">
                <Copy className="w-4 h-4" /> Copy
              </Button>
            </div>
            {isPaid && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Referrer: <span className="font-mono text-primary">{referralCode}</span> · Link: <span className="font-mono">{referralLink}</span>
              </p>
            )}
          </div>
          <Gift className={`w-20 h-20 shrink-0 ${isPaid ? "text-primary/20" : "text-muted-foreground/10"}`} />
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Total Earnings", value: `$${dashboard?.earnings ?? 0}`,           icon: DollarSign,  locked: !isPaid },
          { label: "Total Referrals", value: String(dashboard?.totalReferrals ?? 0),  icon: Users,       locked: false },
          { label: "Active Subs",     value: String(dashboard?.activeReferrals ?? 0), icon: TrendingUp,  locked: !isPaid },
          { label: "Conversion Rate", value: `${dashboard?.conversionRate ?? 0}%`,    icon: TrendingUp,  locked: !isPaid },
        ].map(s => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {s.locked ? (
                <div className="flex items-center gap-2 text-muted-foreground/40">
                  <Lock className="w-5 h-5" />
                  <span className="text-lg font-bold">••••</span>
                </div>
              ) : (
                <div className="text-2xl font-bold flex items-center gap-1">
                  <s.icon className="w-5 h-5 text-primary" /> {s.value}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Referral list */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Referrals</CardTitle>
        </CardHeader>
        <CardContent>
          {refLoading ? (
            <div className="text-sm text-muted-foreground py-2">Loading…</div>
          ) : !referrals?.length ? (
            <div className="text-center py-10 text-muted-foreground border border-dashed rounded-lg space-y-2">
              <Users className="w-8 h-8 mx-auto opacity-20" />
              <p className="text-sm">No referrals yet. Share your link to get started!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {referrals.map(ref => (
                <div key={ref.id} className="flex justify-between items-center py-3 border-b last:border-0">
                  <div>
                    <div className="font-medium">{ref.name ?? "Anonymous User"}</div>
                    <div className="text-sm text-muted-foreground">{ref.email}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={ref.status === "active" ? "default" : "secondary"}>{ref.status}</Badge>
                    <div className="text-sm font-medium text-green-400">${ref.commission ?? 0}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
