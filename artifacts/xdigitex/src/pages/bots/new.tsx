import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateBot } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Bot, Key, Settings, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

export default function NewBot() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [token, setToken] = useState("");
  const [purpose, setPurpose] = useState("");

  const createBot = useCreateBot();

  const handleNext = () => setStep(s => Math.min(s + 1, 4));
  const handlePrev = () => setStep(s => Math.max(s - 1, 1));

  const handleSubmit = () => {
    createBot.mutate({
      data: { name, description, token, purpose }
    }, {
      onSuccess: (bot) => {
        toast.success("Bot created successfully");
        setLocation(`/bots/${bot.id}`);
      },
      onError: () => toast.error("Failed to create bot")
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/bots" className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-md hover:bg-muted inline-flex">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create New Telegram Bot</h1>
          <p className="text-sm text-muted-foreground">Setup a new AI agent for Telegram</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-8">
        {[
          { num: 1, title: "Basics", icon: Bot },
          { num: 2, title: "Token", icon: Key },
          { num: 3, title: "Config", icon: Settings },
          { num: 4, title: "Review", icon: CheckCircle2 }
        ].map((s, i) => (
          <div key={s.num} className="flex flex-col items-center gap-2 relative z-10 flex-1">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
              step >= s.num ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border text-muted-foreground"
            }`}>
              <s.icon className="w-4 h-4" />
            </div>
            <span className={`text-xs font-medium ${step >= s.num ? "text-foreground" : "text-muted-foreground"}`}>
              {s.title}
            </span>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {step === 1 && "Basic Information"}
            {step === 2 && "Telegram Bot Token"}
            {step === 3 && "AI Configuration"}
            {step === 4 && "Review & Create"}
          </CardTitle>
          <CardDescription>
            {step === 1 && "Give your bot a name and description."}
            {step === 2 && "Enter the token provided by BotFather."}
            {step === 3 && "Define the bot's purpose and persona."}
            {step === 4 && "Verify the details before creating the bot."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Bot Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Customer Support Bot" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this bot do?" />
              </div>
            </>
          )}
          {step === 2 && (
            <div className="space-y-2">
              <Label>Bot Token</Label>
              <Input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz..." />
              <p className="text-xs text-muted-foreground mt-2">
                You can get this from <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-primary hover:underline">@BotFather</a> on Telegram.
              </p>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-2">
              <Label>System Prompt / Purpose</Label>
              <Textarea 
                value={purpose} 
                onChange={e => setPurpose(e.target.value)} 
                placeholder="You are a helpful customer support agent..." 
                className="h-32"
              />
            </div>
          )}
          {step === 4 && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-4 border-b pb-4">
                <div className="text-muted-foreground">Name</div>
                <div className="col-span-2 font-medium">{name || "Not set"}</div>
              </div>
              <div className="grid grid-cols-3 gap-4 border-b pb-4">
                <div className="text-muted-foreground">Description</div>
                <div className="col-span-2">{description || "Not set"}</div>
              </div>
              <div className="grid grid-cols-3 gap-4 border-b pb-4">
                <div className="text-muted-foreground">Token</div>
                <div className="col-span-2">{token ? "••••••••••••••••" : "Not set"}</div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-muted-foreground">Purpose</div>
                <div className="col-span-2">{purpose || "Not set"}</div>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between border-t p-6">
          <Button variant="outline" onClick={handlePrev} disabled={step === 1}>
            Back
          </Button>
          {step < 4 ? (
            <Button onClick={handleNext} disabled={(step === 1 && !name) || (step === 2 && !token)}>
              Next Step
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={createBot.isPending}>
              {createBot.isPending ? "Creating..." : "Create Bot"}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}