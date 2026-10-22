import ErrorBoundary from "@/components/ErrorBoundary";
import Home from "@/pages/Home";

// The storefront is a single page; this component is also pre-rendered to
// static HTML by scripts/prerender-storefront.mjs, so keep it browser-API free.
export default function App() {
  return (
    <ErrorBoundary>
      <Home />
    </ErrorBoundary>
  );
}
