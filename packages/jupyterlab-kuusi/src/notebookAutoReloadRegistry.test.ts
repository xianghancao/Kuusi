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
