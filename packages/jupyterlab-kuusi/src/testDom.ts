/**
 * Import first in Node tests whose dependency chain reaches browser-only
 * modules (`@lumino/domutils`, `@codemirror/view`, …) that touch `document`
 * when they load.
 */
import Module from "node:module";
import { JSDOM } from "jsdom";

// Webpack handles these imports in the real build; in Node they are just text.
const extensions = (
  Module as unknown as {
    _extensions: Record<string, (m: { exports: unknown }, file: string) => void>;
  }
)._extensions;
for (const ext of [".svg", ".css"]) {
  extensions[ext] = (module) => {
    module.exports =
      ext === ".svg" ? '<svg xmlns="http://www.w3.org/2000/svg"></svg>' : "";
  };
}

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});
const g = globalThis as Record<string, unknown>;
const window = dom.window as unknown as Record<string, unknown>;

g.window = dom.window;

// Expose every window global (DragEvent, Element, …) that Node lacks.
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in g && key !== "navigator") {
    continue;
  }

  try {
    Object.defineProperty(g, key, {
      configurable: true,
      get: () => window[key],
    });
  } catch {
    /* read-only global on this Node version */
  }
}

// jsdom has no drag / pointer events or observers; modules only reference them.
const noop = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
for (const [name, value] of Object.entries({
  DragEvent: window.MouseEvent,
  PointerEvent: window.MouseEvent,
  TouchEvent: window.UIEvent,
  ResizeObserver: noop,
  IntersectionObserver: noop,
})) {
  if (!(name in g)) {
    g[name] = value;
  }
}

if (typeof dom.window.matchMedia !== "function") {
  Object.defineProperty(dom.window, "matchMedia", {
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
}

export {};
