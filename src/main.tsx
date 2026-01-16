import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { smartGraphRegistry } from "./lib/registry";
import { entityColorStore } from "./lib/store/entityColorStore";

// KAMMI: Centralized App Orchestration
import { appOrchestrator } from '@/lib/core/AppOrchestrator';
appOrchestrator.boot();

createRoot(document.getElementById("root")!).render(<App />);

