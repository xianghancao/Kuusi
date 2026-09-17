export type LivePdfNavMode = "thumbnails" | "outline";

export const LIVE_PDF_NAV_MODE_OPTIONS: {
  value: LivePdfNavMode;
  label: string;
}[] = [
  { value: "thumbnails", label: "Thumbnails" },
  { value: "outline", label: "Contents" },
];

export const isLivePdfNavMode = (value: unknown): value is LivePdfNavMode =>
  value === "thumbnails" || value === "outline";
