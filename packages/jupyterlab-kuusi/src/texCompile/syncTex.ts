import { URLExt } from "@jupyterlab/coreutils";
import { ServerConnection } from "@jupyterlab/services";

export type SyncTexViewResult = {
  ok: boolean;
  page?: number;
  h?: number;
  v?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  error?: string | null;
};

export type SyncTexEditResult = {
  ok: boolean;
  path?: string;
  line?: number;
  column?: number;
  error?: string | null;
};

const postJson = async <T>(route: string, body: unknown): Promise<T> => {
  const settings = ServerConnection.makeSettings();
  const url = URLExt.join(settings.baseUrl, route);
  const response = await ServerConnection.makeRequest(
    url,
    { method: "POST", body: JSON.stringify(body) },
    settings,
  );

  return (await response.json()) as T;
};

export const syncTexView = (
  texPath: string,
  line: number,
  column = 1,
): Promise<SyncTexViewResult> =>
  postJson<SyncTexViewResult>("jupyterlab-kuusi/tex/synctex/view", {
    path: texPath,
    line,
    column,
  });

export const syncTexEdit = (
  pdfPath: string,
  page: number,
  h: number,
  v: number,
): Promise<SyncTexEditResult> =>
  postJson<SyncTexEditResult>("jupyterlab-kuusi/tex/synctex/edit", {
    path: pdfPath,
    page,
    h,
    v,
  });
