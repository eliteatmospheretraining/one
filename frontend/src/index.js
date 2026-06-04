import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

// Benign browser noise from Radix/shadcn ResizeObserver — not an app bug.
const RESIZE_OBSERVER_LOOP = /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;
window.addEventListener(
  "error",
  (event) => {
    if (RESIZE_OBSERVER_LOOP.test(event.message)) {
      event.stopImmediatePropagation();
    }
  },
  true
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
