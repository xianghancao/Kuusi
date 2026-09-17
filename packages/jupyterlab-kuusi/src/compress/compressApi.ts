import { URLExt } from "@jupyterlab/coreutils";
import { ServerConnection } from "@jupyterlab/services";

export type CompressJob = {
  active: boolean;
  kind: string;
  done: number;
  total: number;
  current: string;
  error: string;
  ok: boolean;
  result: { path?: string };
};

export type CompressStartResult = {
  ok: boolean;
  error?: string;
  destPath?: string;
};

const apiUrl = (suffix: string): string => {
  const settings = ServerConnection.makeSettings();
  return URLExt.join(settings.baseUrl, "jupyterlab-kuusi/compress", suffix);
};

export const fetchCompressJob = async (): Promise<CompressJob> => {
  const settings = ServerConnection.makeSettings();
  const response = await ServerConnection.makeRequest(
    apiUrl("job"),
    { method: "GET" },
    settings,
  );
  return (await response.json()) as CompressJob;
};

export const startCompress = async (
  paths: string[],
  destName?: string,
  destDir?: string,
): Promise<CompressStartResult> => {
  const settings = ServerConnection.makeSettings();
  const response = await ServerConnection.makeRequest(
    apiUrl("start"),
    {
      method: "POST",
      body: JSON.stringify({ paths, destName, destDir }),
    },
    settings,
  );
  return (await response.json()) as CompressStartResult;
};

export const startExtract = async (
  path: string,
  destDir?: string,
): Promise<CompressStartResult> => {
  const settings = ServerConnection.makeSettings();
  const response = await ServerConnection.makeRequest(
    apiUrl("extract"),
    {
      method: "POST",
      body: JSON.stringify({ path, destDir }),
    },
    settings,
  );
  return (await response.json()) as CompressStartResult;
};

export const waitForCompressJob = async (
  onProgress?: (job: CompressJob) => void,
): Promise<CompressJob> => {
  for (;;) {
    const job = await fetchCompressJob();
    onProgress?.(job);
    if (!job.active) {
      return job;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 400));
  }
};
