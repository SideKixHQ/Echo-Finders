import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accessRole, claimWithCode } from "../../apps/prototype/src/owner";

let items: Map<string, string>;
const original = (globalThis as { localStorage?: Storage }).localStorage;

beforeEach(() => {
  items = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  };
});
afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = original;
  vi.unstubAllGlobals();
});

function server(status: number, body: unknown) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("Settings › Skeleton key", () => {
  it("turns owner mode on when the server says the key is the owner's", async () => {
    const fetch = server(200, { ok: true, role: "owner" });
    expect(await claimWithCode("  the-key  ")).toBe("owner");
    expect(accessRole()).toBe("owner");
    // Sent trimmed, as a POST, the same check the link makes.
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/owner");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ code: "the-key" });
  });

  it("turns tester mode on for a tester key, keeping the key to recheck", async () => {
    server(200, { ok: true, role: "tester" });
    expect(await claimWithCode("tester-key")).toBe("tester");
    expect(accessRole()).toBe("tester");
    expect(items.get("echo-finders:owner")).toBe("tester:tester-key");
  });

  it("says a wrong key does not fit, and changes nothing", async () => {
    server(403, { error: "That link is not right." });
    expect(await claimWithCode("nope")).toBe("wrong");
    expect(accessRole()).toBeNull();
  });

  it("never asks the server about an empty key", async () => {
    const fetch = server(200, { ok: true, role: "owner" });
    expect(await claimWithCode("   ")).toBe("wrong");
    expect(fetch).not.toHaveBeenCalled();
    expect(accessRole()).toBeNull();
  });

  it("tells offline apart from wrong", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await claimWithCode("the-key")).toBe("offline");
    server(503, { error: "Owner mode is not set up." });
    expect(await claimWithCode("the-key")).toBe("offline");
    expect(accessRole()).toBeNull();
  });
});
