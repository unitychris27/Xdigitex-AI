import { useState, useRef, useEffect, useCallback } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FolderTree, Terminal, Code2, BotMessageSquare, Send, Loader2,
  Sparkles, RefreshCw, ExternalLink, Copy, Check, Globe, Settings2,
  ChevronDown, Cpu,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Provider = "deepseek" | "openrouter";
type ChatMsg = { role: "user" | "assistant"; content: string; streaming?: boolean };

const OPENROUTER_MODELS = [
  "deepseek/deepseek-chat",
  "anthropic/claude-3.5-sonnet",
  "openai/gpt-4o",
  "meta-llama/llama-3.3-70b-instruct",
  "google/gemini-2.0-flash-001",
];

function useSSEStream() {
  const abort = useRef<AbortController | null>(null);

  const stream = useCallback(async (
    url: string,
    body: object,
    onToken: (t: string) => void,
    onDone: (full: string) => void,
    onError: (e: string) => void,
  ) => {
    abort.current?.abort();
    abort.current = new AbortController();

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abort.current.signal,
    });

    if (!res.ok || !res.body) {
      onError(`Server error: ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const lines = part.split("\n");
        let event = "message";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          if (line.startsWith("data: ")) data = line.slice(6).trim();
        }
        if (!data) continue;
        const payload = JSON.parse(data);
        if (event === "token") { fullContent += payload; onToken(payload); }
        else if (event === "done") { onDone(fullContent || payload); }
        else if (event === "error") { onError(payload); }
      }
    }
  }, []);

  const cancel = () => abort.current?.abort();
  return { stream, cancel };
}

export default function Workspace() {
  // Site generation
  const [sitePrompt, setSitePrompt] = useState("");
  const [generatedHtml, setGeneratedHtml] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [genProvider, setGenProvider] = useState<Provider>("deepseek");
  const [genModel, setGenModel] = useState(OPENROUTER_MODELS[0]);
  const [streamingHtml, setStreamingHtml] = useState("");
  const [copied, setCopied] = useState(false);

  // Agent chat
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Hi! I'm your AI development assistant. Ask me to **generate a site**, write code, review architecture, or help with anything in your project." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatProvider, setChatProvider] = useState<Provider>("deepseek");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { stream, cancel } = useSSEStream();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const generateSite = async () => {
    if (!sitePrompt.trim()) return;
    setGenerating(true);
    setStreamingHtml("");
    setGeneratedHtml("");

    const model = genProvider === "openrouter" ? genModel : undefined;

    await stream(
      `${BASE}/api/generate/site`,
      { prompt: sitePrompt, provider: genProvider, ...(model ? { model } : {}) },
      (token) => setStreamingHtml(h => h + token),
      (full) => {
        // Extract HTML from possible markdown fences
        let html = full.trim();
        const fenceMatch = html.match(/```(?:html)?\s*([\s\S]+?)```/i);
        if (fenceMatch) html = fenceMatch[1].trim();
        if (!html.startsWith("<!")) html = full.trim();
        setGeneratedHtml(html);
        setStreamingHtml("");
        setGenerating(false);
        toast.success("Site generated!");
      },
      (err) => {
        toast.error(`Generation failed: ${err}`);
        setGenerating(false);
        setStreamingHtml("");
      },
    ).catch(err => {
      if (err?.name !== "AbortError") toast.error("Stream interrupted");
      setGenerating(false);
    });
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");
    const newMsgs: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages([...newMsgs, { role: "assistant", content: "", streaming: true }]);
    setChatLoading(true);

    let acc = "";
    await stream(
      `${BASE}/api/generate/chat`,
      { messages: newMsgs.map(m => ({ role: m.role, content: m.content })), provider: chatProvider },
      (token) => {
        acc += token;
        setMessages(msgs => msgs.map((m, i) => i === msgs.length - 1 ? { ...m, content: acc } : m));
      },
      () => {
        setMessages(msgs => msgs.map((m, i) => i === msgs.length - 1 ? { ...m, streaming: false } : m));
        setChatLoading(false);
      },
      (err) => {
        toast.error(`Agent error: ${err}`);
        setMessages(msgs => msgs.map((m, i) => i === msgs.length - 1 ? { ...m, content: `Error: ${err}`, streaming: false } : m));
        setChatLoading(false);
      },
    ).catch(err => {
      if (err?.name !== "AbortError") toast.error("Chat interrupted");
      setChatLoading(false);
    });
  };

  const copyHtml = () => {
    navigator.clipboard.writeText(generatedHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openPreview = () => {
    const blob = new Blob([generatedHtml], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
  };

  const currentCode = streamingHtml || generatedHtml;
  const displayCode = currentCode.slice(0, 3000) + (currentCode.length > 3000 ? "\n... (truncated for display)" : "");

  return (
    <div className="h-[calc(100vh-8rem)] -m-6 flex flex-col border-t border-border">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold">AI Workspace</span>
          <Badge variant="outline" className="text-[10px] gap-1 text-green-400 border-green-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* Provider selector */}
          <div className="flex items-center gap-1.5 text-xs border border-border rounded-md px-2 py-1 bg-muted/30">
            <Cpu className="w-3 h-3 text-primary" />
            <select
              value={genProvider}
              onChange={e => setGenProvider(e.target.value as Provider)}
              className="bg-transparent text-xs outline-none cursor-pointer"
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openrouter">OpenRouter</option>
            </select>
            {genProvider === "openrouter" && (
              <>
                <span className="text-muted-foreground">·</span>
                <select
                  value={genModel}
                  onChange={e => setGenModel(e.target.value)}
                  className="bg-transparent text-xs outline-none cursor-pointer max-w-[160px]"
                >
                  {OPENROUTER_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </>
            )}
          </div>
          {generating && (
            <Button variant="outline" size="sm" className="text-xs gap-1.5 text-red-400 border-red-500/30" onClick={cancel}>
              Stop
            </Button>
          )}
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1 rounded-none bg-background">
        {/* Left: Generate + Code view */}
        <ResizablePanel defaultSize={60} minSize={30}>
          <ResizablePanelGroup direction="vertical">
            {/* Generate Site panel */}
            <ResizablePanel defaultSize={15} minSize={10}>
              <div className="h-full flex flex-col p-3 border-b gap-2 bg-card/30">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> Generate Site
                </div>
                <div className="flex gap-2 flex-1">
                  <input
                    className="flex-1 bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                    placeholder="Describe the site you want to build... e.g. 'A SaaS landing page for an AI writing tool with pricing'"
                    value={sitePrompt}
                    onChange={e => setSitePrompt(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && generateSite()}
                    disabled={generating}
                  />
                  <Button onClick={generateSite} disabled={generating || !sitePrompt.trim()} className="gap-1.5 shrink-0">
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {generating ? "Generating..." : "Generate"}
                  </Button>
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle className="h-1 hover:bg-primary/50 transition-colors bg-border/50" />

            {/* Code view */}
            <ResizablePanel defaultSize={55} minSize={20}>
              <div className="h-full flex flex-col bg-[#1e1e1e]">
                <div className="flex items-center justify-between bg-[#2d2d2d] border-b border-[#404040] px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-3.5 h-3.5 text-[#969696]" />
                    <span className="text-[#d4d4d4] text-xs font-medium">
                      {generating ? "generating..." : generatedHtml ? "index.html" : "index.html (empty)"}
                    </span>
                    {generating && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                  </div>
                  {generatedHtml && (
                    <div className="flex items-center gap-1.5">
                      <button onClick={copyHtml} className="flex items-center gap-1 text-[10px] text-[#969696] hover:text-[#d4d4d4] transition-colors px-2 py-0.5 rounded hover:bg-[#404040]">
                        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                      <button onClick={openPreview} className="flex items-center gap-1 text-[10px] text-[#969696] hover:text-[#d4d4d4] transition-colors px-2 py-0.5 rounded hover:bg-[#404040]">
                        <ExternalLink className="w-3 h-3" /> Open
                      </button>
                    </div>
                  )}
                </div>
                <ScrollArea className="flex-1">
                  <pre className="p-4 font-mono text-xs text-[#d4d4d4] leading-relaxed whitespace-pre-wrap">
                    {displayCode || <span className="text-[#858585]">{"// Generated HTML will appear here\n// Enter a prompt above and click Generate"}</span>}
                    {generating && <span className="inline-block w-2 h-4 bg-primary/80 animate-pulse ml-0.5 align-middle" />}
                  </pre>
                </ScrollArea>
              </div>
            </ResizablePanel>

            <ResizableHandle className="h-1 hover:bg-primary/50 transition-colors bg-[#404040]" />

            {/* Preview */}
            <ResizablePanel defaultSize={30} minSize={15}>
              <div className="h-full flex flex-col bg-white">
                <div className="flex items-center justify-between bg-[#1e1e1e] border-b border-[#404040] px-3 py-1.5 shrink-0">
                  <div className="flex items-center gap-2 text-[#d4d4d4]">
                    <Globe className="w-3.5 h-3.5 text-[#969696]" />
                    <span className="text-xs font-medium">Preview</span>
                  </div>
                  {generatedHtml && (
                    <button onClick={() => setGeneratedHtml("")} className="text-[10px] text-[#969696] hover:text-[#d4d4d4] px-2 py-0.5 rounded hover:bg-[#404040]">
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="flex-1 relative">
                  {generatedHtml ? (
                    <iframe
                      srcDoc={generatedHtml}
                      className="w-full h-full border-0"
                      sandbox="allow-scripts allow-same-origin"
                      title="Generated Site Preview"
                    />
                  ) : (
                    <div className="h-full bg-[#1a1a1a] flex flex-col items-center justify-center gap-3 text-[#555]">
                      <Globe className="w-8 h-8 text-[#333]" />
                      <p className="text-xs">Preview will appear here after generation</p>
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle className="w-1 hover:bg-primary/50 transition-colors" />

        {/* Right: Agent Chat */}
        <ResizablePanel defaultSize={40} minSize={25} className="border-l bg-card/30 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-card shrink-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <BotMessageSquare className="w-3.5 h-3.5 text-primary" /> AI Agent
            </div>
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3 h-3 text-muted-foreground" />
              <select
                value={chatProvider}
                onChange={e => setChatProvider(e.target.value as Provider)}
                className="bg-transparent text-[11px] text-muted-foreground outline-none cursor-pointer"
              >
                <option value="deepseek">DeepSeek</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                    {msg.role === "assistant" ? <><BotMessageSquare className="w-3 h-3 text-primary" /> AI Agent</> : "You"}
                  </div>
                  <div className={`max-w-[85%] p-3 rounded-lg text-sm border ${
                    msg.role === "user"
                      ? "bg-primary/15 border-primary/20 text-foreground"
                      : "bg-muted/40 border-border/50 text-foreground"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed [&_pre]:bg-[#1e1e1e] [&_pre]:p-3 [&_pre]:rounded [&_code]:text-[#ce9178] [&_code]:text-xs">
                        <ReactMarkdown>{msg.content || (msg.streaming ? " " : "")}</ReactMarkdown>
                        {msg.streaming && <span className="inline-block w-1.5 h-3.5 bg-primary/80 animate-pulse ml-0.5 align-middle" />}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>

          <div className="p-3 border-t bg-card shrink-0">
            <div className="flex gap-2">
              <textarea
                rows={2}
                placeholder="Ask the agent anything... or say 'generate a landing page for X'"
                className="flex-1 bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-muted-foreground/50"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
                }}
                disabled={chatLoading}
              />
              <Button
                size="icon"
                onClick={chatLoading ? cancel : sendChat}
                disabled={!chatLoading && !chatInput.trim()}
                className={chatLoading ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/30" : ""}
              >
                {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 mt-1.5">Enter to send · Shift+Enter for new line</p>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
