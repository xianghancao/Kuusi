import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_VIEW_BEHAVIOR,
  loadSavedView,
  normalizeViewBehavior,
  saveView,
} from "./viewBehavior";

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};

describe("normalizeViewBehavior", () => {
  it("falls back to defaults for junk", () => {
    assert.deepEqual(normalizeViewBehavior({}), DEFAULT_VIEW_BEHAVIOR);
    assert.deepEqual(
      normalizeViewBehavior({ zoomMinPercent: "x", openView: "nope" }),
      DEFAULT_VIEW_BEHAVIOR,
    );
  });

  it("clamps and snaps the zoom range", () => {
    const result = normalizeViewBehavior({
      zoomMinPercent: 1,
      zoomMaxPercent: 5000,
    });

    assert.equal(result.zoomMinPercent, 5);
    assert.equal(result.zoomMaxPercent, 800);
    assert.equal(normalizeViewBehavior({ zoomMaxPercent: 330 }).zoomMaxPercent, 350);
  });

  it("keeps the wheel speed in range", () => {
    assert.equal(normalizeViewBehavior({ wheelZoomSpeed: 99 }).wheelZoomSpeed, 3);
    assert.equal(normalizeViewBehavior({ wheelZoomSpeed: 0 }).wheelZoomSpeed, 0.25);
    assert.equal(normalizeViewBehavior({ wheelZoomSpeed: 1.5 }).wheelZoomSpeed, 1.5);
  });

  it("accepts known modes only", () => {
    const result = normalizeViewBehavior({ wheelBehavior: "zoom", openView: "fit" });

    assert.equal(result.wheelBehavior, "zoom");
    assert.equal(result.openView, "fit");
  });
});

describe("saved views", () => {
  it("round-trips a view per path", () => {
    const storage = memoryStorage();
    saveView(storage, "a.md", { zoom: 0.4, panX: 10, panY: -20 }, 1);

    assert.deepEqual(loadSavedView(storage, "a.md"), {
      zoom: 0.4,
      panX: 10,
      panY: -20,
      at: 1,
    });
    assert.equal(loadSavedView(storage, "b.md"), null);
  });

  it("ignores corrupt storage and keeps only recent entries", () => {
    const storage = memoryStorage();
    storage.setItem("jupyterlab-kuusi:mindmap-views", "{not json");
    assert.equal(loadSavedView(storage, "a.md"), null);

    for (let i = 0; i < 60; i += 1) {
      saveView(storage, `f${i}.md`, { zoom: 1, panX: 0, panY: 0 }, i);
    }

    assert.equal(loadSavedView(storage, "f0.md"), null);
    assert.notEqual(loadSavedView(storage, "f59.md"), null);
  });
});
