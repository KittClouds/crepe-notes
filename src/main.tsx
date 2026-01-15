import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { smartGraphRegistry } from "./lib/registry";
import { entityColorStore } from "./lib/store/entityColorStore";

// Initialize entity color registry FIRST (sets CSS variables before any rendering)
entityColorStore.initialize();

// Initialize entity registry
smartGraphRegistry.init().catch(console.error);

createRoot(document.getElementById("root")!).render(<App />);

