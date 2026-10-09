/**
 * How each echo landed, on this device (`reactions.ts` in the engine).
 *
 * One face per echo, the latest one. Unreadable storage reads as no reactions: a bad value
 * should cost somebody their taste, never the app.
 */
import type { Reaction } from "@echofinders/core";

const KEY = "echo-finders:reactions";
const OK = new Set(["whoa", "chills", "ha", "moved", "meh"]);

export type Reactions = Readonly<Record<string, { readonly reaction: Reaction; readonly at: number }>>;

export function readReactions(): Reactions {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, { reaction?: unknown; at?: unknown }>;
    const out: Record<string, { reaction: Reaction; at: number }> = {};
    for (const [id, v] of Object.entries(raw ?? {})) {
      if (v && OK.has(String(v.reaction)) && typeof v.at === "number") out[id] = { reaction: v.reaction as Reaction, at: v.at };
    }
    return out;
  } catch {
    return {};
  }
}

export function react(current: Reactions, echoId: string, reaction: Reaction, at = Date.now()): Reactions {
  const next = { ...current, [echoId]: { reaction, at } };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* This session only. */
  }
  return next;
}
