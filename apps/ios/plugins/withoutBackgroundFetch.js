/**
 * Leave `fetch` out of UIBackgroundModes.
 *
 * expo-task-manager's own config plugin adds `fetch` to every app that installs it, for
 * background fetch tasks. Echo Finders has none: it uses the task manager only for the
 * walk's background location (`src/walk/task.ts`). A background mode the app does not use
 * is a question at App Store review, so the app declares only the two it does: `location`
 * (expo-location, `isIosBackgroundLocationEnabled`) and `audio` (expo-audio,
 * `enableBackgroundPlayback`).
 */
const { withInfoPlist } = require("expo/config-plugins");

module.exports = function withoutBackgroundFetch(config) {
  return withInfoPlist(config, (config) => {
    const modes = config.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) config.modResults.UIBackgroundModes = modes.filter((mode) => mode !== "fetch");
    return config;
  });
};
