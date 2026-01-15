import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UIStateProvider } from "@/contexts/UIStateContext";
import { NERProvider } from "@/contexts/NERContext";
import { entityColorStore } from "@/lib/store/entityColorStore";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Initialize entity colors on startup (syncs to CSS variables)
entityColorStore.initialize();

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UIStateProvider>
      <NERProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </NERProvider>
    </UIStateProvider>
  </QueryClientProvider>
);

export default App;


