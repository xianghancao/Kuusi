import { PathExt } from "@jupyterlab/coreutils";
import type { IDocumentManager } from "@jupyterlab/docmanager";
import type { IDefaultFileBrowser } from "@jupyterlab/filebrowser";
import {
  InputDialog,
  Notification,
  showDialog,
  Dialog,
} from "@jupyterlab/apputils";
import type { Contents } from "@jupyterlab/services";
import { startCompress, startExtract, waitForCompressJob } from "./compressApi";

const defaultZipName = (paths: string[]): string => {
  if (paths.length === 1) {
    const base = PathExt.basename(paths[0]);
    return base.toLowerCase().endsWith(".zip")
      ? base.slice(0, -4)
      : base;
  }
  return "Archive";
};

const selectedPaths = (browser: IDefaultFileBrowser): string[] =>
  [...browser.selectedItems()].map((item) => item.path);

export const refreshFileBrowser = async (
  browser: IDefaultFileBrowser,
): Promise<void> => {
  await browser.model.refresh();
};

const runJobWithToast = async (
  label: string,
  destHint?: string,
): Promise<boolean> => {
  Notification.info(`${label}…`, { autoClose: false });
  try {
    const job = await waitForCompressJob();
    if (!job.ok) {
      void showDialog({
        title: "Compress failed",
        body: job.error || "Unknown error",
        buttons: [Dialog.okButton()],
      });
      return false;
    }
    Notification.success(
      destHint ? `${label} finished — ${destHint}` : `${label} finished`,
      { autoClose: 5000 },
    );
    return true;
  } catch (error) {
    void showDialog({
      title: "Compress failed",
      body: error instanceof Error ? error.message : String(error),
      buttons: [Dialog.okButton()],
    });
    return false;
  }
};

export const compressSelection = async (
  browser: IDefaultFileBrowser,
  docManager: IDocumentManager,
  paths?: string[],
): Promise<void> => {
  const targets = paths ?? selectedPaths(browser);
  if (!targets.length) {
    void showDialog({
      title: "Compress",
      body: "Select one or more files or folders in the file browser first.",
      buttons: [Dialog.okButton()],
    });
    return;
  }

  const value = await InputDialog.getText({
    title: "Compress to ZIP",
    text: defaultZipName(targets),
    okLabel: "Compress",
    placeholder: "Archive name (without .zip)",
  });
  const typed = value.value?.trim() ?? "";
  if (!value.button.accept || !typed) {
    return;
  }

  const destName = typed;
  const start = await startCompress(targets, destName);
  if (!start.ok) {
    void showDialog({
      title: "Compress failed",
      body: start.error ?? "Could not start",
      buttons: [Dialog.okButton()],
    });
    return;
  }

  const ok = await runJobWithToast("Compressing", start.destPath);
  if (ok) {
    await refreshFileBrowser(browser);
    if (start.destPath) {
      try {
        await docManager.openOrReveal(start.destPath);
      } catch {
        /* reveal optional */
      }
    }
  }
};

const isZipItem = (item: Contents.IModel): boolean =>
  item.type !== "directory" && item.path.toLowerCase().endsWith(".zip");

export const extractZipSelection = async (
  browser: IDefaultFileBrowser,
  docManager: IDocumentManager,
  path?: string,
): Promise<void> => {
  const zipPath =
    path ??
    [...browser.selectedItems()].filter(isZipItem).map((item) => item.path)[0];

  if (!zipPath) {
    void showDialog({
      title: "Extract",
      body: "Select a single .zip file in the file browser.",
      buttons: [Dialog.okButton()],
    });
    return;
  }

  const result = await showDialog({
    title: "Extract ZIP",
    body: `Extract “${PathExt.basename(zipPath)}” into a new “*_extracted” folder next to the archive?`,
    buttons: [Dialog.cancelButton(), Dialog.okButton({ label: "Extract" })],
  });
  if (!result.button.accept) {
    return;
  }

  const start = await startExtract(zipPath);
  if (!start.ok) {
    void showDialog({
      title: "Extract failed",
      body: start.error ?? "Could not start",
      buttons: [Dialog.okButton()],
    });
    return;
  }

  const ok = await runJobWithToast("Extracting", start.destPath);
  if (ok) {
    await refreshFileBrowser(browser);
    if (start.destPath) {
      try {
        await docManager.openOrReveal(start.destPath);
      } catch {
        /* reveal optional */
      }
    }
  }
};
