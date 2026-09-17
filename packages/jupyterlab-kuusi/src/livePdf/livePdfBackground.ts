export type LivePdfBackground =
  | "default"
  | "gray"
  | "sepia"
  | "blue"
  | "green"
  | "dark"
  | "white"
  | "black";

export const LIVE_PDF_BACKGROUND_OPTIONS: {
  value: LivePdfBackground;
  label: string;
}[] = [
  { value: "default", label: "Default" },
  { value: "gray", label: "Gray" },
  { value: "sepia", label: "Sepia" },
  { value: "blue", label: "Academic Blue" },
  { value: "green", label: "Eye Care" },
  { value: "dark", label: "Dark" },
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
];

const BACKGROUND_COLORS: Record<
  Exclude<LivePdfBackground, "default">,
  string
> = {
  gray: "#d4d4d4",
  sepia: "#f2e8cf",
  blue: "#dce8f5",
  green: "#e6efe3",
  dark: "#2f2f2f",
  white: "#ffffff",
  black: "#141414",
};

export const isLivePdfBackground = (value: unknown): value is LivePdfBackground =>
  value === "default" ||
  value === "gray" ||
  value === "sepia" ||
  value === "blue" ||
  value === "green" ||
  value === "dark" ||
  value === "white" ||
  value === "black";

export const resolveLivePdfBackgroundColor = (
  background: LivePdfBackground,
): string | null => {
  if (background === "default") {
    return null;
  }

  return BACKGROUND_COLORS[background];
};
