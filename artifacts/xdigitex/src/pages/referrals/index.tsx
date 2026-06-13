import { useGetReferrals, useListReferrals } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Gift, Copy, Users, DollarSign, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Referrals() {
  const { data: dashboard, isLoading: dashLoading } = useGetReferrals();
  const { data: referrals, isLoading: refLoading } = useListReferrals();

  const handleCopy = () => {
    if (dashboard?.referralLink) {
      navigator.clipboard.writeText(dashboard.referralLink);
      toast.success("Referral link copied!");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
          <p className="text-sm text-muted-foreground">Invite developers and earn credits</p>
        </div>
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-lg font-semibold mb-1">Your Referral Link</h3>
            <p className="text-sm text-muted-foreground mb-4">Share this link to give friends $50 in credits and get $50 for yourself when they upgrade.</p>
            <div className="flex items-center gap-2">
              <Input value={dashboard?.referralLink || "https://xdigitex.ai/r/..."} readOnly className="w-[300px] bg-background font-mono text-sm" />
              <Button onClick={handleCopy}>
                <Copy className="w-4 h-4 mr-2" /> Copy
              </Button>
            </div>
          </div>
          <Gift className="w-24 h-24 text-primary/20" />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center"><DollarSign className="w-5 h-5" /> {dashboard?.earnings || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Referrals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center"><Users className="w-5 h-5 mr-2" /> {dashboard?.totalReferrals || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard?.activeReferrals || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conversion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center"><TrendingUp className="w-5 h-5 mr-2 text-primary" /> {dashboard?.conversionRate || 0}%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Referrals</CardTitle>
        </CardHeader>
        <CardContent>
          {refLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : referrals?.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">No referrals yet. Share your link to get started!</div>
          ) : (
            <div className="space-y-4">
              {referrals?.map(ref => (
                <div key={ref.id} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <div className="font-medium">{ref.name || "Anonymous User"}</div>
                    <div className="text-sm text-muted-foreground">{ref.email}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={ref.status === 'active' ? 'default' : 'secondary'}>{ref.status}</Badge>
                    <div className="text-sm font-medium">${ref.commission || 0}</div>
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