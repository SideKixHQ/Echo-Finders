import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as owner } from "../../api/owner.js";

const post = (body: unknown) =>
  new Request("https://echo-finders.vercel.app/api/owner", { method: "POST", body: JSON.stringify(body) });

describe("owner mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("opens for the right code only", async () => {
    vi.stubEnv("OWNER_CODE", "right-code-123");
    expect((await owner(post({ code: "right-code-123" }))).status).toBe(200);
    expect((await owner(post({ code: "wrong-code-123" }))).status).toBe(403);
    expect((await owner(post({ code: "" }))).status).toBe(403);
    expect((await owner(post({}))).status).toBe(403);
  });

  it("is off for everyone when no code is set", async () => {
    vi.stubEnv("OWNER_CODE", "");
    expect((await owner(post({ code: "" }))).status).toBe(503);
  });
});
