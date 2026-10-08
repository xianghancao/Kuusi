import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createKeyedReset } from "./menuFooter";

type S = { a: number; b: string; c: boolean };

describe("createKeyedReset", () => {
  it("is customized only when an owned key differs from the baseline", () => {
    let settings: S = { a: 1, b: "x", c: false };
    const reset = createKeyedReset<S>({
      keys: ["a", "b"],
      getSettings: () => settings,
      baseline: () => ({ a: 1, b: "x", c: true }),
      update: () => undefined,
    });

    assert.equal(reset.isCustomized(), false);

    // `c` is not owned by this menu, so it never counts.
    settings = { ...settings, c: true };
    assert.equal(reset.isCustomized(), false);

    settings = { ...settings, b: "y" };
    assert.equal(reset.isCustomized(), true);
  });

  it("resets only the owned keys to the baseline", () => {
    const updates: Array<Partial<S>> = [];
    const reset = createKeyedReset<S>({
      keys: ["a"],
      getSettings: () => ({ a: 9, b: "keep", c: false }),
      baseline: () => ({ a: 2, b: "other", c: true }),
      update: (partial) => {
        updates.push(partial);
      },
    });

    reset.reset();
    assert.deepEqual(updates, [{ a: 2 }]);
  });
});
