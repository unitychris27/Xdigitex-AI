import { useGetBillingOverview, useListInvoices } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Download, Activity, Zap, HardDrive } from "lucide-react";

export default function Billing() {
  const { data: overview, isLoading: overviewLoading } = useGetBillingOverview();
  const { data: invoices, isLoading: invoicesLoading } = useListInvoices();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing & Usage</h1>
          <p className="text-sm text-muted-foreground">Manage your subscription, usage, and invoices</p>
        </div>
        <Button variant="outline">Update Payment Method</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Plan</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{overview?.plan || "Free"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              ${overview?.monthlyCost || 0} / month
            </p>
            <Button variant="link" className="w-full mt-4 h-8">Upgrade Plan</Button>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">AI Token Usage</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(overview?.tokenUsage || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              of {(overview?.tokenLimit || 0).toLocaleString()} limit
            </p>
            <div className="w-full bg-muted h-1.5 mt-4 rounded-full overflow-hidden">
              <div 
                className="bg-primary h-full" 
                style={{ width: `${Math.min(100, ((overview?.tokenUsage || 0) / (overview?.tokenLimit || 1)) * 100)}%` }} 
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">API Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(overview?.apiRequests || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              this billing cycle
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Storage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.storageUsage || 0} GB</div>
            <p className="text-xs text-muted-foreground mt-1">
              of {overview?.storageLimit || 0} GB limit
            </p>
            <div className="w-full bg-muted h-1.5 mt-4 rounded-full overflow-hidden">
              <div 
                className="bg-primary h-full" 
                style={{ width: `${Math.min(100, ((overview?.storageUsage || 0) / (overview?.storageLimit || 1)) * 100)}%` }} 
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="text-center py-4 text-muted-foreground">Loading invoices...</div>
          ) : invoices?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border border-dashed rounded">
              No invoices found
            </div>
          ) : (
            <div className="space-y-4">
              {invoices?.map(invoice => (
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
                    <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'}>{invoice.status}</Badge>
                    <Button variant="ghost" size="icon">
                      <Download className="w-4 h-4" />
                    </Button>
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