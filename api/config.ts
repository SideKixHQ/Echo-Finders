/** GET /api/config: are real payments switched on? The app asks once and falls back to the device record if not. */
import { configured, reply } from "./_stripe.js";

export function GET(): Response {
  return reply(200, { payments: configured() });
}
