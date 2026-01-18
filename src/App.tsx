import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UIStateProvider } from "@/contexts/UIStateContext";
import { NERProvider } from "@/contexts/NERContext";
import { ScopeProvider } from "@/contexts/ScopeContext";
import { entityColorStore } from "@/lib/store/entityColorStore";
import Index from "./pages/Index";
import GraphPage from "./pages/GraphPage";
import FantasyCalendarPage from "./pages/FantasyCalendarPage";
import { WikiPage } from "./features/wiki";
import NotFound from "./pages/NotFound";
import { CalendarProvider } from "./contexts/CalendarContext";
import { NarrativeFocusProvider } from "./contexts/NarrativeFocusContext";
import { TTSProvider } from "@/lib/tts";

// Initialize entity colors on startup (syncs to CSS variables)
entityColorStore.initialize();

import { LoadingScreen } from "@/components/loading/LoadingScreen";
import { appOrchestrator } from "@/lib/core/AppOrchestrator";
import { useState, useEffect } from "react";

const App = () => {
  const [isBooting, setIsBooting] = useState(appOrchestrator.getState() !== 'ready');

  useEffect(() => {
    // Subscribe to boot state
    const unsubscribe = appOrchestrator.subscribe((state) => {
      setIsBooting(state !== 'ready');
    });
    return () => { unsubscribe; };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ScopeProvider>
        <UIStateProvider>
          <NERProvider>
            <NarrativeFocusProvider>
              <CalendarProvider>
                <TTSProvider>
                  <TooltipProvider>
                    <LoadingScreen isVisible={isBooting} />
                    <Toaster />
                    <Sonner />
                    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/graph" element={<GraphPage />} />
                        <Route path="/calendar" element={<FantasyCalendarPage />} />
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
      </ScopeProvider>
    </QueryClientProvider>
  );
};

export default App;


