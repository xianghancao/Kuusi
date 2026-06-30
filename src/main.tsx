import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "katex/dist/katex.min.css";
import "./styles.css";
import App from "./App";

const isResizeObserverLoopError = (message: unknown) =>
  typeof message === "string" &&
  message.includes("ResizeObserver loop completed with undelivered notifications");

window.addEventListener(
  "error",
  (event) => {
    if (isResizeObserverLoopError(event.message)) {
      event.stopImmediatePropagation();
    }
  },
  true,
);

window.addEventListener("unhandledrejection", (event) => {
  if (isResizeObserverLoopError(event.reason?.message ?? event.reason)) {
    event.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
