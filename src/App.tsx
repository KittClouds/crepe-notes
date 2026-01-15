import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UIStateProvider } from "@/contexts/UIStateContext";
import { NERProvider } from "@/contexts/NERContext";
import { entityColorStore } from "@/lib/store/entityColorStore";
import Index from "./pages/Index";
import GraphPage from "./pages/GraphPage";
import { WikiPage } from "./features/wiki";
import NotFound from "./pages/NotFound";
import { CalendarProvider } from "./contexts/CalendarContext";
import { NarrativeFocusProvider } from "./contexts/NarrativeFocusContext";
import { TTSProvider } from "@/lib/tts";

// Initialize entity colors on startup (syncs to CSS variables)
entityColorStore.initialize();

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UIStateProvider>
      <NERProvider>
        <NarrativeFocusProvider>
          <CalendarProvider>
            <TTSProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/graph" element={<GraphPage />} />
                    <Route path="/wiki/*" element={<WikiPage />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
              </TooltipProvider>
            </TTSProvider>
          </CalendarProvider>
        </NarrativeFocusProvider>
      </NERProvider>
    </UIStateProvider>
  </QueryClientProvider>
);

export default App;


