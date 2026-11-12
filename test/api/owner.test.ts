import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE as forget, GET as who, POST as owner } from "../../api/owner.js";

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

describe("the App Store reviewer's code", () => {
  afterEach(() => vi.unstubAllEnvs());
  const get = (cookie: string) => new Request("https://echo-finders.vercel.app/api/owner", { headers: { cookie } });
  const value = (res: Response) => /ef_access=([^;]*)/.exec(res.headers.get("set-cookie") ?? "")?.[1] ?? "";

  it("opens tester mode on its own, without a tester code", async () => {
    vi.stubEnv("OWNER_CODE", "");
    vi.stubEnv("TESTER_CODE", "");
    vi.stubEnv("REVIEWER_CODE", "reviewer-code-1");
    expect(await (await owner(post({ code: "reviewer-code-1" }))).json()).toEqual({ ok: true, role: "tester" });
    expect((await owner(post({ code: "" }))).status).toBe(403);
  });

  it("keeps working when the tester code changes", async () => {
    vi.stubEnv("TESTER_CODE", "tester-code-12");
    vi.stubEnv("REVIEWER_CODE", "reviewer-code-1");
    const remembered = value(await owner(post({ code: "reviewer-code-1" })));
    vi.stubEnv("TESTER_CODE", "a-new-tester-code");
    expect(await (await who(get(`ef_access=${remembered}`))).json()).toEqual({ role: "tester" });
    expect((await owner(post({ code: "tester-code-12" }))).status).toBe(403);
    expect((await owner(post({ code: "reviewer-code-1" }))).status).toBe(200);
  });

  it("stops working when it is retired", async () => {
    vi.stubEnv("TESTER_CODE", "tester-code-12");
    vi.stubEnv("REVIEWER_CODE", "reviewer-code-1");
    const remembered = value(await owner(post({ code: "reviewer-code-1" })));
    vi.stubEnv("REVIEWER_CODE", "");
    expect(await (await who(get(`ef_access=${remembered}`))).json()).toEqual({ role: null });
    expect((await owner(post({ code: "reviewer-code-1" }))).status).toBe(403);
  });
});

describe("remembered by a cookie, for a phone whose storage was wiped", () => {
  afterEach(() => vi.unstubAllEnvs());
  const get = (cookie?: string) =>
    new Request("https://echo-finders.vercel.app/api/owner", cookie ? { headers: { cookie } } : {});
  const setCookie = (res: Response) => res.headers.get("set-cookie") ?? "";
  const value = (res: Response) => /ef_access=([^;]*)/.exec(setCookie(res))?.[1] ?? "";

  it("sets a long-lived, private cookie that never holds the code", async () => {
    vi.stubEnv("OWNER_CODE", "right-code-123");
    const res = await owner(post({ code: "right-code-123" }));
    const c = setCookie(res);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/Secure/);
    expect(c).toMatch(/SameSite=Strict/);
    expect(c).toMatch(/Path=\/api\/owner/);
    expect(c).toMatch(/Max-Age=34560000/);
    expect(c).not.toContain("right-code-123");
    expect(setCookie(await owner(post({ code: "wrong-code-123" })))).toBe("");
  });

  it("reads the phone back as owner or tester", async () => {
    vi.stubEnv("OWNER_CODE", "owner-code-123");
    vi.stubEnv("TESTER_CODE", "tester-code-12");
    const o = value(await owner(post({ code: "owner-code-123" })));
    const t = value(await owner(post({ code: "tester-code-12" })));
    expect(await (await who(get(`ef_access=${o}`))).json()).toEqual({ role: "owner" });
    expect(await (await who(get(`other=1; ef_access=${t}`))).json()).toEqual({ role: "tester" });
    expect(await (await who(get())).json()).toEqual({ role: null });
  });

  it("is void once the code is changed, and is cleared", async () => {
    vi.stubEnv("TESTER_CODE", "tester-code-12");
    const t = value(await owner(post({ code: "tester-code-12" })));
    vi.stubEnv("TESTER_CODE", "a-new-code-345");
    const res = await who(get(`ef_access=${t}`));
    expect(await res.json()).toEqual({ role: null });
    expect(setCookie(res)).toMatch(/Max-Age=0/);
  });

  it("cannot be forged by naming a role", async () => {
    vi.stubEnv("OWNER_CODE", "owner-code-123");
    expect(await (await who(get("ef_access=owner"))).json()).toEqual({ role: null });
    expect(await (await who(get("ef_access=owner.abc"))).json()).toEqual({ role: null });
  });

  it("is forgotten on DELETE", async () => {
    expect(setCookie(await forget())).toMatch(/ef_access=; .*Max-Age=0/);
  });
});
