import { useListNotifications, useMarkAllNotificationsRead } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Info, AlertTriangle, XCircle, Rocket, Shield } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";

export default function Notifications() {
  const { data: notifications, isLoading } = useListNotifications();
  const markAllRead = useMarkAllNotificationsRead();
  const queryClient = useQueryClient();

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        toast.success("All notifications marked as read");
      }
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'deployment': return <Rocket className="w-4 h-4 text-blue-500" />;
      case 'security': return <Shield className="w-4 h-4 text-red-500" />;
      case 'billing': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default: return <Info className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">Stay updated on your workspace activity</p>
        </div>
        <Button variant="outline" onClick={handleMarkAllRead} disabled={markAllRead.isPending || !notifications?.some(n => !n.read)}>
          <Check className="w-4 h-4 mr-2" /> Mark all read
        </Button>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading notifications...</div>
        ) : notifications?.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg">
            <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">You're all caught up!</p>
          </div>
        ) : (
          notifications?.map(note => (
            <Card key={note.id} className={`transition-colors ${!note.read ? 'bg-card border-primary/30' : 'bg-muted/30 border-border/50 opacity-80'}`}>
              <CardContent className="p-4 flex gap-4">
                <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${!note.read ? 'bg-background shadow-sm' : 'bg-transparent'}`}>
                  {getIcon(note.type)}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className={`text-sm font-semibold ${!note.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {note.title}
                    </h4>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(note.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{note.message}</p>
                </div>
                {!note.read && (
                  <div className="flex items-center">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}