import { useListPromotions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Megaphone, Plus, Tag } from "lucide-react";

export default function Promotions() {
  const { data: promotions, isLoading } = useListPromotions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Promotions & Campaigns</h1>
          <p className="text-sm text-muted-foreground">Manage discount codes and special offers</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Create Campaign
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-3 text-center py-8">Loading...</div>
        ) : promotions?.length === 0 ? (
          <div className="col-span-3 text-center py-12 border border-dashed rounded-lg">
            <Megaphone className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium">No active promotions</h3>
            <p className="text-sm text-muted-foreground mt-1">Create a campaign to offer discounts to users.</p>
          </div>
        ) : (
          promotions?.map(promo => (
            <Card key={promo.id}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Tag className="w-4 h-4 text-primary" />
                      {promo.name}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground capitalize">{promo.type.replace('_', ' ')}</div>
                  </div>
                  <Badge variant={promo.status === 'active' ? 'default' : 'secondary'}>{promo.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary mb-4">
                  {promo.discount ? `${promo.discount}% OFF` : 'Special Offer'}
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Valid From:</span>
                    <span>{new Date(promo.startDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Valid Until:</span>
                    <span>{new Date(promo.endDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Usage Count:</span>
                    <span>{promo.usageCount || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}