// The app sits outside the npm workspace (its React is not the web app's), and reaches the
// engine through `file:../../packages/core`, a symlink, and the generated echo library in
// the web app's source (`src/library.ts`). Metro only follows a path out of the project
// when the folder it points at is watched. Only `apps/prototype/src` is watched, not the
// web app as a whole: its `public/` holds the rendered audio, hundreds of megabytes.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [
  path.resolve(__dirname, "../../packages/core"),
  path.resolve(__dirname, "../prototype/src"),
];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
module.exports = config;
