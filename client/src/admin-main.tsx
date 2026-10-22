import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "@/components/ErrorBoundary";
import Admin from "@/pages/Admin";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Admin />
    </ErrorBoundary>
  </StrictMode>
);
