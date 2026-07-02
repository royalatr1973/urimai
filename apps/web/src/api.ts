import type { Assessment, Profile, SchemeMeta } from "./types";

// All calls go to OUR backend (same origin → Vite proxies /api to the server). The browser
// never calls api.anthropic.com, and never sees the API key or the rules engine.

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export function getSchemes(): Promise<{ schemes: SchemeMeta[] }> {
  return fetch("/api/schemes").then((r) => {
    if (!r.ok) throw new Error(`/api/schemes failed: ${r.status}`);
    return r.json();
  });
}

export function assess(sessionId: string, text: string): Promise<Assessment> {
  return postJson("/api/assess", { sessionId, text });
}

export function reassess(sessionId: string, profile: Profile): Promise<Assessment> {
  return postJson("/api/reassess", { sessionId, profile });
}
