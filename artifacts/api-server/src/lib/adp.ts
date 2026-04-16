/**
 * ADP Workforce Now — Time & Attendance client (stub, credentials-ready).
 *
 * Wire up by setting these env vars (all required for live sync):
 *   ADP_CLIENT_ID        — OAuth 2.0 client id from ADP Marketplace
 *   ADP_CLIENT_SECRET    — OAuth 2.0 client secret
 *   ADP_BASE_URL         — e.g. https://api.adp.com
 *   ADP_SSL_CERT_PEM     — PEM-encoded client cert (mTLS is required by ADP)
 *   ADP_SSL_KEY_PEM      — PEM-encoded client private key
 *
 * When creds are missing this module becomes a no-op that never throws and
 * leaves entries in `adpSyncStatus = "pending"` so they can be synced later.
 */

import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";

export type AdpPushPayload = {
  entryId: string;
  userId: string;
  venueId: string;
  clockIn: Date;
  clockOut: Date | null;
  source: string;
  biometricVerified: boolean;
  deviceId: string | null;
  totalHours: string | null;
  breakMinutes: number | null;
};

export type AdpPushResult =
  | { ok: true; externalId: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

export type AdpPullEntry = {
  externalId: string;
  userId: string;
  venueId: string;
  clockIn: Date;
  clockOut: Date | null;
  source: string;
  deviceId: string | null;
};

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : null;
}

export function isAdpConfigured(): boolean {
  return !!(env("ADP_CLIENT_ID") && env("ADP_CLIENT_SECRET") && env("ADP_BASE_URL") && env("ADP_SSL_CERT_PEM") && env("ADP_SSL_KEY_PEM"));
}

export function adpStatus() {
  return {
    configured: isAdpConfigured(),
    baseUrl: env("ADP_BASE_URL"),
    hasClientId: !!env("ADP_CLIENT_ID"),
    hasClientSecret: !!env("ADP_CLIENT_SECRET"),
    hasMtlsCert: !!env("ADP_SSL_CERT_PEM") && !!env("ADP_SSL_KEY_PEM"),
  };
}

// ── OAuth token cache ────────────────────────────────────────────────────────
let tokenCache: { token: string; expiresAt: number } | null = null;
let dispatcherCache: UndiciAgent | null = null;

function mtlsDispatcher(): UndiciAgent {
  if (dispatcherCache) return dispatcherCache;
  dispatcherCache = new UndiciAgent({
    connect: {
      cert: env("ADP_SSL_CERT_PEM") ?? undefined,
      key:  env("ADP_SSL_KEY_PEM")  ?? undefined,
    },
    keepAliveTimeout: 30_000,
  });
  return dispatcherCache;
}

async function getAccessToken(): Promise<string | null> {
  if (!isAdpConfigured()) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env("ADP_CLIENT_ID")!,
    client_secret: env("ADP_CLIENT_SECRET")!,
  });

  const res = await undiciFetch(`${env("ADP_BASE_URL")}/auth/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    dispatcher: mtlsDispatcher(),
  });
  if (!res.ok) throw new Error(`ADP token failed: ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

// ── Push (or update) a clock-in/clock-out in ADP ────────────────────────────
// If `existingExternalId` is provided we PUT to update the existing time entry
// (e.g. appending a clockOut or applying a manager edit). Otherwise we POST.
export async function pushTimeEntry(p: AdpPushPayload, existingExternalId?: string | null): Promise<AdpPushResult> {
  if (!isAdpConfigured()) return { ok: false, skipped: true, reason: "ADP credentials not configured" };
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, skipped: true, reason: "No ADP token" };

    const payload = {
      associateOID: p.userId,
      locationId: p.venueId,
      startDateTime: p.clockIn.toISOString(),
      endDateTime:   p.clockOut?.toISOString() ?? null,
      captureMethod: p.source === "terminal_biometric" ? "BIOMETRIC_TERMINAL"
                   : p.source === "phone_biometric"    ? "MOBILE_BIOMETRIC"
                   : p.source === "mobile_gps"         ? "MOBILE_GPS"
                   : "MANUAL",
      deviceId: p.deviceId,
      biometricVerified: p.biometricVerified,
      totalHours: p.totalHours ? Number(p.totalHours) : undefined,
      breakMinutes: p.breakMinutes ?? undefined,
    };

    const url = existingExternalId
      ? `${env("ADP_BASE_URL")}/time/v2/time-entries/${encodeURIComponent(existingExternalId)}`
      : `${env("ADP_BASE_URL")}/time/v2/time-entries`;

    const res = await undiciFetch(url, {
      method: existingExternalId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      dispatcher: mtlsDispatcher(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, skipped: false, error: `ADP ${existingExternalId ? "update" : "push"} ${res.status}: ${text.slice(0, 300)}` };
    }
    const j = (await res.json()) as { id?: string; timeCardId?: string };
    return { ok: true, externalId: existingExternalId ?? j.id ?? j.timeCardId ?? `adp-${p.entryId}` };
  } catch (err) {
    return { ok: false, skipped: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Pull recent ADP time events for a venue ──────────────────────────────────
export async function pullRecentEntries(venueId: string, sinceMs: number): Promise<AdpPullEntry[]> {
  if (!isAdpConfigured()) return [];
  try {
    const token = await getAccessToken();
    if (!token) return [];

    const url = `${env("ADP_BASE_URL")}/time/v2/time-entries?locationId=${encodeURIComponent(venueId)}&since=${new Date(sinceMs).toISOString()}`;
    const res = await undiciFetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      dispatcher: mtlsDispatcher(),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { entries?: Array<{
      id: string; associateOID: string; locationId: string;
      startDateTime: string; endDateTime: string | null;
      captureMethod?: string; deviceId?: string | null;
    }> };
    return (j.entries ?? []).map((e) => ({
      externalId: e.id,
      userId: e.associateOID,
      venueId: e.locationId,
      clockIn: new Date(e.startDateTime),
      clockOut: e.endDateTime ? new Date(e.endDateTime) : null,
      source: e.captureMethod === "BIOMETRIC_TERMINAL" ? "terminal_biometric"
            : e.captureMethod === "MOBILE_BIOMETRIC"   ? "phone_biometric"
            : e.captureMethod === "MOBILE_GPS"         ? "mobile_gps"
            : "adp_import",
      deviceId: e.deviceId ?? null,
    }));
  } catch {
    return [];
  }
}
