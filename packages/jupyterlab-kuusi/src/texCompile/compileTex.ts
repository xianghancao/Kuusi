import { URLExt } from "@jupyterlab/coreutils";
import { ServerConnection } from "@jupyterlab/services";

export type TexEngine = "auto" | "pdflatex" | "xelatex";

export type TexCompileResult = {
  ok: boolean;
  exitCode: number;
  engine?: TexEngine | "pdflatex" | "xelatex";
  log: string;
  pdfPath: string | null;
  error?: string | null;
};

export const compileTex = async (
  path: string,
  engine: TexEngine = "auto",
): Promise<TexCompileResult> => {
  const settings = ServerConnection.makeSettings();
  const url = URLExt.join(settings.baseUrl, "jupyterlab-kuusi/tex/compile");
  const response = await ServerConnection.makeRequest(
    url,
    {
      method: "POST",
      body: JSON.stringify({ path, engine }),
    },
    settings,
  );

  const payload = (await response.json()) as TexCompileResult;

  if (!response.ok && !payload.log) {
    throw new Error(payload.error ?? `Compile request failed (${response.status})`);
  }

  return payload;
};

export const pdfPathForTex = (texPath: string): string => {
  if (texPath.toLowerCase().endsWith(".tex")) {
    return `${texPath.slice(0, -4)}.pdf`;
  }

  return `${texPath}.pdf`;
};

export const formatEngineLabel = (engine: string | undefined): string => {
  if (engine === "xelatex" || engine === "pdflatex") {
    return engine;
  }

  return "TeX";
};
