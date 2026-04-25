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

// Endpoints where a 401 is expected (wrong PIN, logout while already
// expired) and should NOT trigger the auto-logout flow.
const AUTH_401_NO_REDIRECT = ["/api/auth/pin", "/api/auth/logout"];

let alreadyHandling401 = false;
function handleAuthExpiredOnce() {
  if (alreadyHandling401) return;
  alreadyHandling401 = true;
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch { /* ignore */ }
  // Hard reload back to the sign-in page. Doing it via window.location
  // (rather than just clearing React state) also resets all in-flight
  // queries / pending mutations so the user lands cleanly on the PIN
  // screen instead of seeing flashes of stale data.
  if (typeof window !== "undefined") window.location.replace("/");
}

const originalFetch: typeof window.fetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
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
  const response = await originalFetch(input, { ...init, headers });
  // Auto-logout when the session has expired or been invalidated. We skip
  // this on the login/logout endpoints themselves so a wrong PIN attempt
  // doesn't bounce the user back to a fresh login screen mid-typing.
  if (
    response.status === 401 &&
    !AUTH_401_NO_REDIRECT.some((p) => url.includes(p))
  ) {
    handleAuthExpiredOnce();
  }
  return response;
}) as typeof window.fetch;

// Auto-refresh open tabs the moment a new service worker takes over.
// vite-plugin-pwa's `registerType: "autoUpdate"` already prompts the
// updated SW to activate (skipWaiting + clientsClaim in sw.ts), but
// without a controllerchange listener the page keeps running its
// already-loaded JS until the user manually reloads. With this
// listener, deploys propagate to every open tab within seconds:
// 1. browser re-fetches sw.js (no-cache header on the server)
// 2. new SW installs, activates, claims clients
// 3. controllerchange fires → window.location.reload() → fresh build
//
// `reloaded` guards against the install-time case where there was no
// previous controller (first-ever visit), which would otherwise loop.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    if (!navigator.serviceWorker.controller) return;
    reloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
