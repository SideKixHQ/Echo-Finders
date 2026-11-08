import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as owner } from "../../api/owner.js";

const post = (body: unknown) =>
  new Request("https://echo-finders.vercel.app/api/owner", { method: "POST", body: JSON.stringify(body) });

describe("owner mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("opens for the right code only", async () => {
    vi.stubEnv("OWNER_CODE", "right-code-123");
    vi.stubEnv("TESTER_CODE", "");
    const res = await owner(post({ code: "right-code-123" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, role: "owner" });
    expect((await owner(post({ code: "wrong-code-123" }))).status).toBe(403);
    expect((await owner(post({ code: "" }))).status).toBe(403);
    expect((await owner(post({}))).status).toBe(403);
  });

  it("is off for everyone when no code is set", async () => {
    vi.stubEnv("OWNER_CODE", "");
    vi.stubEnv("TESTER_CODE", "");
    expect((await owner(post({ code: "" }))).status).toBe(503);
  });
});

describe("tester mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("says which code it was", async () => {
    vi.stubEnv("OWNER_CODE", "owner-code-123");
    vi.stubEnv("TESTER_CODE", "tester-code-12");
    expect(await (await owner(post({ code: "tester-code-12" }))).json()).toEqual({ ok: true, role: "tester" });
    expect(await (await owner(post({ code: "owner-code-123" }))).json()).toEqual({ ok: true, role: "owner" });
  });

  it("works without an owner code, and an empty code never matches", async () => {
    vi.stubEnv("OWNER_CODE", "");
    vi.stubEnv("TESTER_CODE", "tester-code-12");
    expect((await owner(post({ code: "tester-code-12" }))).status).toBe(200);
    expect((await owner(post({ code: "" }))).status).toBe(403);
  });
});
