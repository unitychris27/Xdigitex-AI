import { useListSecrets } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KeyRound, Plus, Lock, Copy, RefreshCw, Trash2 } from "lucide-react";

export default function Secrets() {
  const { data: secrets, isLoading } = useListSecrets();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Secrets Vault</h1>
          <p className="text-sm text-muted-foreground">Securely manage API keys, certificates, and credentials</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Secret
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Environment Secrets</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading secrets...</div>
          ) : secrets?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Lock className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No secrets stored yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {secrets?.map(secret => (
                <div key={secret.id} className="flex items-center justify-between p-4 border rounded-lg bg-card/50">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-muted-foreground">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {secret.name}
                        <Badge variant="outline" className="text-[10px] h-5">{secret.environment}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-mono">
                        ••••••••••••••••••••
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-muted-foreground mr-4">
                      Last used: {secret.lastUsed ? new Date(secret.lastUsed).toLocaleDateString() : 'Never'}
                    </div>
                    <Button variant="ghost" size="icon" title="Copy reference">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Rotate secret">
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-4 h-4" />
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