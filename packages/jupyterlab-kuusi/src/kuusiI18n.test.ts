import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TranslationBundle } from "@jupyterlab/translation";

import { wrapKuusiBundle } from "./kuusiI18n";
import { ZH_CN } from "./locale/zhCN";

const identity = {
  __(msgid: string, ...args: unknown[]): string {
    return msgid.replace(/%(\d+)/g, (_, index) =>
      String(args[Number(index) - 1] ?? ""),
    );
  },
} as TranslationBundle;

describe("kuusi i18n", () => {
  it("keeps English when the JupyterLab language is not Chinese", () => {
    const bundle = wrapKuusiBundle(identity, "en");
    assert.equal(bundle.__("Background"), "Background");
    assert.equal(bundle.__("%1 image", "PNG"), "PNG image");
  });

  it("uses the zh_CN map when the official catalog is identity", () => {
    const bundle = wrapKuusiBundle(identity, "zh-CN");
    assert.equal(bundle.__("Background"), "背景");
    assert.equal(bundle.__("Insert a cell below"), ZH_CN["Insert a cell below"]);
    assert.equal(bundle.__("%1 image", "PNG"), "PNG 图片");
  });

  it("prefers an official translation over the fallback map", () => {
    const official = {
      __(msgid: string, ...args: unknown[]): string {
        if (msgid === "Background") {
          return "官方背景";
        }

        return msgid.replace(/%(\d+)/g, (_, index) =>
          String(args[Number(index) - 1] ?? ""),
        );
      },
    } as TranslationBundle;

    const bundle = wrapKuusiBundle(official, "zh-Hans");
    assert.equal(bundle.__("Background"), "官方背景");
    assert.equal(bundle.__("Font"), "字体");
  });
});
