import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { FolderTree, Terminal, Code2, BotMessageSquare, Play, Settings2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Workspace() {
  return (
    <div className="h-[calc(100vh-8rem)] -m-6 flex flex-col border-t border-border">
      <div className="flex items-center justify-between p-2 border-b bg-card">
        <div className="flex items-center gap-4 text-sm px-2">
          <span className="font-medium">Acme Migration Workspace</span>
          <span className="text-muted-foreground">main</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors">
            <Play className="w-3 h-3" /> Run Agents
          </button>
        </div>
      </div>
      
      <ResizablePanelGroup direction="horizontal" className="flex-1 rounded-none bg-background">
        {/* File Explorer */}
        <ResizablePanel defaultSize={15} minSize={10} className="border-r bg-card/50">
          <div className="flex items-center gap-2 p-2 px-3 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <FolderTree className="w-3.5 h-3.5" /> Files
          </div>
          <ScrollArea className="h-full p-2">
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2 p-1.5 hover:bg-muted rounded text-foreground cursor-pointer">
                <FolderTree className="w-4 h-4 text-blue-400" /> src
              </div>
              <div className="flex items-center gap-2 p-1.5 pl-6 hover:bg-muted rounded text-foreground cursor-pointer">
                <Code2 className="w-4 h-4 text-yellow-400" /> index.ts
              </div>
              <div className="flex items-center gap-2 p-1.5 pl-6 hover:bg-muted rounded text-foreground cursor-pointer bg-muted/80">
                <Code2 className="w-4 h-4 text-blue-400" /> api.ts
              </div>
            </div>
          </ScrollArea>
        </ResizablePanel>
        
        <ResizableHandle className="w-1 hover:bg-primary/50 transition-colors" />
        
        {/* Code Editor */}
        <ResizablePanel defaultSize={60} minSize={30}>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={70}>
              <div className="h-full flex flex-col bg-[#1e1e1e]">
                <div className="flex items-center gap-1 bg-[#2d2d2d] border-b border-[#404040]">
                  <div className="px-4 py-2 bg-[#1e1e1e] text-[#d4d4d4] text-xs font-medium border-t-2 border-primary">
                    api.ts
                  </div>
                  <div className="px-4 py-2 text-[#969696] text-xs font-medium hover:bg-[#1e1e1e] cursor-pointer">
                    index.ts
                  </div>
                </div>
                <div className="flex-1 p-4 font-mono text-sm text-[#d4d4d4] overflow-auto">
                  <div className="flex"><span className="text-[#858585] w-8 text-right pr-4 select-none">1</span><span className="text-[#c586c0]">import</span> &#123; <span className="text-[#9cdcfe]">express</span> &#125; <span className="text-[#c586c0]">from</span> <span className="text-[#ce9178]">'express'</span>;</div>
                  <div className="flex"><span className="text-[#858585] w-8 text-right pr-4 select-none">2</span></div>
                  <div className="flex"><span className="text-[#858585] w-8 text-right pr-4 select-none">3</span><span className="text-[#569cd6]">const</span> app = <span className="text-[#dcdcaa]">express</span>();</div>
                  <div className="flex"><span className="text-[#858585] w-8 text-right pr-4 select-none">4</span></div>
                  <div className="flex"><span className="text-[#858585] w-8 text-right pr-4 select-none">5</span>app.<span className="text-[#dcdcaa]">get</span>(<span className="text-[#ce9178]">'/'</span>, (req, res) <span className="text-[#569cd6]">=&gt;</span> &#123;</div>
                  <div className="flex"><span className="text-[#858585] w-8 text-right pr-4 select-none">6</span>  res.<span className="text-[#dcdcaa]">json</span>(&#123; <span className="text-[#9cdcfe]">status:</span> <span className="text-[#ce9178]">'ok'</span> &#125;);</div>
                  <div className="flex"><span className="text-[#858585] w-8 text-right pr-4 select-none">7</span>&#125;);</div>
                </div>
              </div>
            </ResizablePanel>
            
            <ResizableHandle className="h-1 hover:bg-primary/50 transition-colors bg-[#404040]" />
            
            {/* Terminal */}
            <ResizablePanel defaultSize={30} minSize={10}>
              <div className="h-full bg-black text-[#00ff00] font-mono text-xs flex flex-col">
                <div className="flex items-center justify-between p-1.5 px-3 bg-[#1e1e1e] text-[#d4d4d4] border-b border-[#404040]">
                  <div className="flex items-center gap-2 uppercase tracking-wider font-semibold">
                    <Terminal className="w-3.5 h-3.5" /> Terminal
                  </div>
                  <Settings2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
                </div>
                <ScrollArea className="flex-1 p-2">
                  <div className="space-y-1">
                    <div><span className="text-blue-400">~/projects/acme</span> $ npm run dev</div>
                    <div className="text-gray-400">&gt; acme@1.0.0 dev</div>
                    <div className="text-gray-400">&gt; nodemon src/index.ts</div>
                    <div>[nodemon] 2.0.22</div>
                    <div>[nodemon] to restart at any time, enter `rs`</div>
                    <div>[nodemon] watching path(s): *.*</div>
                    <div className="text-yellow-400">[nodemon] starting `ts-node src/index.ts`</div>
                    <div>Server running on port 3000</div>
                  </div>
                </ScrollArea>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        
        <ResizableHandle className="w-1 hover:bg-primary/50 transition-colors" />
        
        {/* Agent Chat */}
        <ResizablePanel defaultSize={25} minSize={20} className="border-l bg-card/30 flex flex-col">
          <div className="flex items-center gap-2 p-2 px-3 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-card">
            <BotMessageSquare className="w-3.5 h-3.5" /> Architect Agent
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <BotMessageSquare className="w-3 h-3" /> Architect Agent
                </div>
                <div className="bg-muted/50 p-3 rounded-md text-sm border border-border">
                  I've analyzed the current `api.ts` file. We should add input validation using Zod before processing requests. Shall I create a new schema file?
                </div>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                <div className="text-xs font-medium text-muted-foreground">You</div>
                <div className="bg-primary/20 text-primary-foreground p-3 rounded-md text-sm border border-primary/30">
                  Yes, create `schemas.ts` and add validation for the user creation endpoint.
                </div>
              </div>
            </div>
          </ScrollArea>
          <div className="p-3 border-t bg-card">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Message agent..." 
                className="w-full bg-muted/50 border border-border rounded-md pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button className="absolute right-2 top-2 text-muted-foreground hover:text-primary transition-colors">
                <Play className="w-4 h-4" />
              </button>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}