// The app sits outside the npm workspace (its React is not the web app's), and reaches the
// engine through `file:../../packages/core`, a symlink. Metro only follows a symlink out of
// the project when the folder it points at is watched.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../../packages/core")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
module.exports = config;
