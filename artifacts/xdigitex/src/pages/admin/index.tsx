import { useAdminGetSystemHealth, useAdminGetCosts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Activity, Database, Server, Box, Layers } from "lucide-react";

export default function Admin() {
  const { data: health, isLoading: healthLoading } = useAdminGetSystemHealth();
  const { data: costs } = useAdminGetCosts();

  const getHealthColor = (status: string) => {
    if (status === 'healthy') return 'bg-green-500/20 text-green-500 border-green-500/30';
    if (status === 'warning') return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
    return 'bg-red-500/20 text-red-500 border-red-500/30';
  };

  const ServiceStatus = ({ name, data, icon: Icon }: any) => (
    <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-muted">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <div className="font-medium text-sm">{name}</div>
          <div className="text-xs text-muted-foreground">{data?.latency ? `${data.latency}ms latency` : 'Unknown latency'}</div>
        </div>
      </div>
      <Badge variant="outline" className={getHealthColor(data?.status || 'unknown')}>
        {data?.status || 'unknown'}
      </Badge>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" /> Super Admin
          </h1>
          <p className="text-sm text-muted-foreground">Platform monitoring and administration</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.1)]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" /> System Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {healthLoading ? (
              <div className="text-sm text-muted-foreground">Checking systems...</div>
            ) : (
              <>
                <ServiceStatus name="API Gateway" data={health?.api} icon={Server} />
                <ServiceStatus name="Primary Database" data={health?.database} icon={Database} />
                <ServiceStatus name="Message Queue" data={health?.queue} icon={Layers} />
                <ServiceStatus name="Worker Nodes" data={health?.workers} icon={Activity} />
                <ServiceStatus name="Storage Service" data={health?.storage} icon={Box} />
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Platform Costs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Daily Spend</span>
                  <div className="text-2xl font-mono">${costs?.dailySpend?.toFixed(2) || '0.00'}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Monthly Spend</span>
                  <div className="text-2xl font-mono text-primary">${costs?.monthlySpend?.toFixed(2) || '0.00'}</div>
                </div>
              </div>
              
              <div className="mt-6">
                <h4 className="text-sm font-medium mb-3">Provider Breakdown</h4>
                <div className="space-y-2">
                  {costs?.providerCosts?.map(pc => (
                    <div key={pc.provider} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground capitalize">{pc.provider}</span>
                      <span className="font-mono">${pc.cost.toFixed(2)}</span>
                    </div>
                  ))}
                  {!costs?.providerCosts?.length && (
                    <div className="text-sm text-muted-foreground">No cost data available</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}