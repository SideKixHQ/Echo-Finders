/**
 * Narrator names, for the line under the player.
 *
 * Placeholders keyed by voice id, because `content/voices.yml` still has `name: TODO` for
 * all three — nobody has confirmed what these voices are actually called in ElevenLabs, and
 * inventing names here would put fiction in the interface. They become real the moment that
 * file does.
 */
export const VOICE_LABEL: Record<string, string> = {
  IMlxLW3qgn0MWgfz7Vnh: "Default narrator",
  hP72SDESIJq2YuAblBqz: "Second narrator",
  UrTldiIxfedDl9tlesyS: "Narrator for children",
};
