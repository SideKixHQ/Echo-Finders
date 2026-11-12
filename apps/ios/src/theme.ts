/**
 * The web app's dark palette and type, as React Native values.
 *
 * Taken from `apps/prototype/src/theme.css` (the dark scheme), which was built to the
 * approved MVP boards. Where the two disagree, the boards win, then the web app.
 *
 * The rule the web app follows holds here too: AQUA IS THE INTERFACE, EMBER IS THE ECHO.
 * Anything the listener operates is aqua; anything that is an echo glows warm.
 */
import type { EchoCategory } from "@echofinders/core";

export const color = {
  space: "#0b0f2b",
  panel: "rgba(11, 15, 43, 0.96)",
  slate: "#1f252e",
  white: "#ffffff",
  cool: "#d8dce5",
  muted: "#aeb5c2",
  mutedSoft: "rgba(174, 181, 194, 0.78)",
  aqua: "#00ffe7",
  ember: "#ff9e12",
  emberCore: "#ffd77a",
  magentaInk: "#ff3d8f",
  line: "rgba(255, 255, 255, 0.12)",
  line2: "rgba(255, 255, 255, 0.22)",
  /** The primary button: aqua, with deep teal ink rather than white (1.4:1 on aqua). */
  btn: "#00ffe7",
  btnInk: "#042b28",
} as const;

/**
 * Font families, as loaded by `useFonts` in the root layout. Sora for everything people
 * read, Space Grotesk for figures and small capitals, as the boards set them.
 */
export const font = {
  regular: "Sora_400Regular",
  medium: "Sora_500Medium",
  semibold: "Sora_600SemiBold",
  mono: "SpaceGrotesk_400Regular",
  monoMedium: "SpaceGrotesk_500Medium",
} as const;

/** The six step type scale from the web app. 14 is the floor. */
export const size = {
  title: 32,
  echo: 26,
  button: 18,
  body: 17,
  secondary: 15,
  label: 14,
} as const;

/** The gutter the web app uses at phone width. */
export const gutter = 16;

/** Category ink on the dark ground (`--cat-*` in the dark scheme). */
export const CATEGORY_COLOR: Record<EchoCategory, string> = {
  history: "#9b95ff",
  "true-crime": "#ff4d9d",
  legend: "#9ef0a8",
  kids: "#00ffe7",
  arts: "#ff9e4f",
  "food-drink": "#ff87c3",
  people: "#ffd98a",
  built: "#7fb4ff",
  land: "#7fd4c1",
  inspo: "#d7f75b",
  unsolved: "#e8ecf5",
  disasters: "#ff5c4d",
  music: "#c38bff",
  firsts: "#ffc21a",
  hidden: "#9aa6bd",
};

/** What each category is called, the web app's `CATEGORY_LABEL`. */
export const CATEGORY_LABEL: Record<EchoCategory, string> = {
  history: "History",
  "true-crime": "True crime",
  arts: "Arts",
  kids: "Kids",
  legend: "Ghosts",
  people: "People",
  "food-drink": "Food & drink",
  built: "Landmarks",
  land: "Landmarks",
  inspo: "Inspo",
  unsolved: "Unsolved",
  disasters: "Disasters",
  music: "Music",
  firsts: "Firsts",
  hidden: "Hidden",
};
