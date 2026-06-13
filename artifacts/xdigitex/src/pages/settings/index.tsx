import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useGetMe, useListApiKeys, useCreateApiKey } from "@workspace/api-client-react";
import { Key, User, Shield, Bell } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getListApiKeysQueryKey } from "@workspace/api-client-react";

export default function Settings() {
  const { data: user } = useGetMe();
  const { data: apiKeys } = useListApiKeys();
  const createKey = useCreateApiKey();
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");

  const handleCreateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName) return;
    createKey.mutate({ data: { name: newKeyName } }, {
      onSuccess: (data) => {
        toast.success("API Key created successfully");
        setNewKeyName("");
        queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
        // In a real app, show the key value in a modal once
        alert(`Copy your new key: ${data.key}`); 
      }
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account settings and preferences.</p>
      </div>

      <Tabs defaultValue="profile" className="flex flex-col md:flex-row gap-6">
        <TabsList className="flex flex-col h-auto bg-transparent items-stretch w-full md:w-48 gap-1 p-0">
          <TabsTrigger value="profile" className="justify-start px-4 py-2 data-[state=active]:bg-muted"><User className="w-4 h-4 mr-2" /> Profile</TabsTrigger>
          <TabsTrigger value="security" className="justify-start px-4 py-2 data-[state=active]:bg-muted"><Shield className="w-4 h-4 mr-2" /> Security</TabsTrigger>
          <TabsTrigger value="api-keys" className="justify-start px-4 py-2 data-[state=active]:bg-muted"><Key className="w-4 h-4 mr-2" /> API Keys</TabsTrigger>
          <TabsTrigger value="notifications" className="justify-start px-4 py-2 data-[state=active]:bg-muted"><Bell className="w-4 h-4 mr-2" /> Notifications</TabsTrigger>
        </TabsList>

        <div className="flex-1">
          <TabsContent value="profile" className="m-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your personal details here.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold uppercase">
                    {user?.name?.substring(0,2) || 'XD'}
                  </div>
                  <Button variant="outline" size="sm">Change Avatar</Button>
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input defaultValue={user?.name} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input defaultValue={user?.email} disabled />
                  <p className="text-[10px] text-muted-foreground">Email cannot be changed.</p>
                </div>
              </CardContent>
              <CardFooter className="border-t pt-6">
                <Button>Save Changes</Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="api-keys" className="m-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>Manage keys used to access the XDIGITEX API.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={handleCreateKey} className="flex gap-2">
                  <Input 
                    placeholder="Key name (e.g. Production App)" 
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                  />
                  <Button type="submit" disabled={createKey.isPending}>Create new key</Button>
                </form>

                <div className="space-y-3 pt-4">
                  {apiKeys?.map(apiKey => (
                    <div key={apiKey.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <div className="font-medium text-sm">{apiKey.name}</div>
                        <code className="text-xs text-muted-foreground bg-muted px-1 py-0.5 rounded mt-1 inline-block">
                          {apiKey.prefix}...
                        </code>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Created {new Date(apiKey.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                  {apiKeys?.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-4">No API keys created yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="m-0">
             <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <Input type="password" />
                </div>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" />
                </div>
              </CardContent>
              <CardFooter className="border-t pt-6">
                <Button>Update Password</Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="m-0">
             <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Configure how you want to be notified.</p>
              </CardContent>
            </Card>
          </TabsContent>

        </div>
      </Tabs>
    </div>
  );
}