export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== "string") {
        reject(new Error("Could not encode recording."));
        return;
      }

      const comma = result.indexOf(",");

      if (comma < 0) {
        reject(new Error("Could not encode recording."));
        return;
      }

      resolve(result.slice(comma + 1));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Could not encode recording."));
    };

    reader.readAsDataURL(blob);
  });

export const base64ToObjectUrl = (
  base64: string,
  mimeType: string,
): { url: string; revoke: () => void } => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);

  return {
    url,
    revoke: () => {
      URL.revokeObjectURL(url);
    },
  };
};
