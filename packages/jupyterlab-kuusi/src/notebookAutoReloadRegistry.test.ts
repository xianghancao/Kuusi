import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  registerNotebookAutoReloadListener,
  syncNotebookAutoReloadLastModified,
} from "./notebookAutoReloadRegistry";

describe("notebook auto-reload registry", () => {
  it("does not recurse when a refresh reports back through the sync", () => {
    const path = "a.ipynb";
    let calls = 0;
    const dispose = registerNotebookAutoReloadListener(path, {
      syncPolling: () => undefined,
      refreshLastModified: () => {
        calls += 1;
        // Mirrors diskAutoReload → onLastModified → sync.
        syncNotebookAutoReloadLastModified(path);
      },
    });

    syncNotebookAutoReloadLastModified(path);
    dispose();

    assert.equal(calls, 1);
  });

  it("refreshes every open view once per save", () => {
    const path = "b.ipynb";
    const calls: number[] = [0, 0];
    const disposers = [0, 1].map((i) =>
      registerNotebookAutoReloadListener(path, {
        syncPolling: () => undefined,
        refreshLastModified: () => {
          calls[i] += 1;
          syncNotebookAutoReloadLastModified(path);
        },
      }),
    );

    syncNotebookAutoReloadLastModified(path);
    disposers.forEach((dispose) => dispose());

    assert.deepEqual(calls, [1, 1]);
  });
});

import {
  getNotebookAutoReloadEnabled,
  setNotebookAutoReloadDefault,
  setNotebookAutoReloadEnabled,
} from "./notebookAutoReloadRegistry";

describe("auto-reload default", () => {
  it("applies to files without their own switch, and the switch wins", () => {
    setNotebookAutoReloadDefault(false);
    assert.equal(getNotebookAutoReloadEnabled("x.ipynb"), false);

    setNotebookAutoReloadEnabled("y.ipynb", true);
    assert.equal(getNotebookAutoReloadEnabled("y.ipynb"), true);

    setNotebookAutoReloadDefault(true);
    assert.equal(getNotebookAutoReloadEnabled("x.ipynb"), true);

    // y was switched on by hand: turning the default off leaves it on.
    setNotebookAutoReloadDefault(false);
    assert.equal(getNotebookAutoReloadEnabled("y.ipynb"), true);
    setNotebookAutoReloadDefault(true);
  });

  it("tells open views about the new default", () => {
    const path = "z.ipynb";
    let synced = 0;
    const dispose = registerNotebookAutoReloadListener(path, {
      syncPolling: () => {
        synced += 1;
      },
      refreshLastModified: () => undefined,
    });

    setNotebookAutoReloadDefault(false);
    setNotebookAutoReloadDefault(true);
    dispose();

    assert.equal(synced, 2);
  });
});
