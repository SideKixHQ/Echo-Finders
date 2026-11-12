/**
 * The three style types `apps/prototype/src/basemap-style.ts` imports from "maplibre-gl".
 *
 * The phone draws the web app's own navy style (`src/basemap.ts` imports that file in
 * place), but it has MapLibre Native, not MapLibre GL JS, so there is no "maplibre-gl"
 * package here. GL JS takes these types from the style spec package, and so does MapLibre
 * React Native, at the same major version, so `tsconfig.json` points "maplibre-gl" here.
 * The import in the web file is `import type`, which Babel erases: Metro never looks for
 * the package.
 */
export type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
