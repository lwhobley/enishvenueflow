import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setUserIdGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

const AUTH_STORAGE_KEY = "enosh-auth-user";

function readAuthFromStorage(): { id?: string; sessionToken?: string } | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Bearer-token auth: every request carries the session token issued by
// /auth/pin. The server reads it via Authorization, looks up the session,
// and populates req.auth — so the API never has to trust a caller-
// supplied user id.
setAuthTokenGetter(() => {
  const auth = readAuthFromStorage();
  return auth && typeof auth.sessionToken === "string" ? auth.sessionToken : null;
});

// x-user-id is now redundant for endpoints we control (the server derives
// identity from the bearer token). We still emit it so older endpoints
// that haven't migrated yet keep working; remove once every handler has
// switched to req.auth.
setUserIdGetter(() => {
  const auth = readAuthFromStorage();
  return auth && typeof auth.id === "string" ? auth.id : null;
});

// Intercept window.fetch so any raw fetch("/api/...") call from a hook or
// page picks up the bearer token without each call site having to remember
// to wire it. The orval-generated client uses its own Authorization-setting
// path (setAuthTokenGetter above) — we only inject when no Authorization
// header has already been set, so we never double-apply.
function isApiUrl(url: string): boolean {
  try {
    if (url.startsWith("/api/")) return true;
    if (url.startsWith("http")) {
      const u = new URL(url);
      return u.origin === window.location.origin && u.pathname.startsWith("/api/");
    }
    return false;
  } catch {
    return false;
  }
}

const originalFetch: typeof window.fetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (!isApiUrl(url)) return originalFetch(input, init);

  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  if (!headers.has("authorization")) {
    const auth = readAuthFromStorage();
    if (auth?.sessionToken) headers.set("authorization", `Bearer ${auth.sessionToken}`);
  }
  return originalFetch(input, { ...init, headers });
}) as typeof window.fetch;

createRoot(document.getElementById("root")!).render(<App />);
