/**
 * Microsoft Outlook (Microsoft Graph) email sender via the Replit Outlook
 * connector. The connector handles OAuth — we just look up the token at
 * request time and call the Graph `/me/sendMail` endpoint.
 *
 * If the connector is not authorized at request time, the caller should
 * surface a 412 to the UI so the user can re-authorize.
 */

const OUTLOOK_CONNECTOR_NAME = "outlook";

type ReplitConnectionItem = {
  settings?: {
    access_token?: string;
    oauth?: { credentials?: { access_token?: string } };
  };
};

async function fetchAccessToken(): Promise<string | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const replIdentity = process.env.REPL_IDENTITY;
  const webRenewal = process.env.WEB_REPL_RENEWAL;
  if (!hostname) return null;
  const xToken = replIdentity
    ? `repl ${replIdentity}`
    : webRenewal
      ? `depl ${webRenewal}`
      : null;
  if (!xToken) return null;
  try {
    const res = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=${OUTLOOK_CONNECTOR_NAME}`,
      { headers: { Accept: "application/json", X_REPLIT_TOKEN: xToken } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: ReplitConnectionItem[] };
    const conn = data.items?.[0];
    return (
      conn?.settings?.access_token ??
      conn?.settings?.oauth?.credentials?.access_token ??
      null
    );
  } catch {
    return null;
  }
}

export type SendMailInput = {
  to: string[];
  subject: string;
  htmlBody: string;
  textBody: string;
};

/**
 * Build an RFC 5322 multipart/alternative message so receiving clients can
 * pick text/plain or text/html. Microsoft Graph's `/me/sendMail` accepts a
 * raw MIME message when the request body is base64-encoded with
 * Content-Type: text/plain.
 */
function buildMimeMessage(input: SendMailInput): string {
  const boundary = `vfboundary_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const to = input.to.join(", ");
  const headers = [
    `MIME-Version: 1.0`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(input.subject)}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");

  const textPart = [
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    input.textBody,
  ].join("\r\n");

  const htmlPart = [
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    input.htmlBody,
  ].join("\r\n");

  return `${headers}\r\n\r\n${textPart}\r\n${htmlPart}\r\n--${boundary}--\r\n`;
}

function encodeMimeHeader(value: string): string {
  // Encode non-ASCII subject lines per RFC 2047.
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export type SendMailResult =
  | { ok: true; messageId?: string }
  | { ok: false; reason: "unauthorized"; message: string }
  | { ok: false; reason: "send_failed"; message: string };

export async function sendOutlookMail(input: SendMailInput): Promise<SendMailResult> {
  const token = await fetchAccessToken();
  if (!token) {
    return {
      ok: false,
      reason: "unauthorized",
      message:
        "Outlook is not connected. Please connect a Microsoft Outlook account in Replit integrations and try again.",
    };
  }

  const mime = buildMimeMessage(input);
  const base64Mime = Buffer.from(mime, "utf8").toString("base64");

  try {
    // Send as raw MIME so we get a true multipart/alternative (text + HTML).
    // Per Microsoft Graph docs, POST /me/sendMail with Content-Type: text/plain
    // accepts a base64-encoded MIME message body.
    const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: base64Mime,
    });
    if (res.status === 202 || res.status === 200) {
      return { ok: true };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        reason: "unauthorized",
        message: `Outlook rejected the send (HTTP ${res.status}). Please reconnect the Outlook integration.`,
      };
    }
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body?.error?.message ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    return {
      ok: false,
      reason: "send_failed",
      message: `Outlook send failed (HTTP ${res.status}): ${detail || "unknown error"}`.slice(0, 500),
    };
  } catch (err) {
    return {
      ok: false,
      reason: "send_failed",
      message: `Outlook send error: ${(err as Error).message}`.slice(0, 500),
    };
  }
}
