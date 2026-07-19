/**
 * WhatsApp Cloud API plumbing — the only place that knows about Meta, media ids, and phone
 * numbers. Webhook verification, inbound parsing, and the outbound client live here; none of
 * it leaks into the orchestrator.
 */
import crypto from "node:crypto";

// --- inbound shape (normalized) ---------------------------------------------
export interface InboundMessage {
  from: string; // sender's WhatsApp number — used to route the reply and key the session
  kind: "text" | "audio" | "other";
  text?: string;
  mediaId?: string;
}

// --- webhook verification ----------------------------------------------------

/** GET handshake: echo hub.challenge iff the verify token matches. Returns null otherwise. */
export function verifyChallenge(
  query: Record<string, unknown>,
  verifyToken: string,
): string | null {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  if (mode === "subscribe" && typeof token === "string" && token === verifyToken && typeof challenge === "string") {
    return challenge;
  }
  return null;
}

/** Validate the X-Hub-Signature-256 HMAC over the RAW request body. Timing-safe. */
export function verifySignature(appSecret: string, rawBody: string | Buffer, header: string | undefined): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- inbound parsing ---------------------------------------------------------

/** Extract the first message from a Cloud API webhook payload, normalized. null for non-message events (status callbacks etc.). */
export function parseInbound(body: unknown): InboundMessage | null {
  try {
    const value = (body as any)?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg || typeof msg.from !== "string") return null;

    if (msg.type === "text" && typeof msg.text?.body === "string") {
      return { from: msg.from, kind: "text", text: msg.text.body };
    }
    if ((msg.type === "audio" || msg.type === "voice") && msg.audio?.id) {
      return { from: msg.from, kind: "audio", mediaId: msg.audio.id };
    }
    return { from: msg.from, kind: "other" };
  } catch {
    return null;
  }
}

// --- outbound client ---------------------------------------------------------

export interface WhatsAppClient {
  downloadMedia(mediaId: string): Promise<Buffer>;
  sendText(to: string, text: string): Promise<void>;
  sendAudio(to: string, audio: Buffer, mimeType?: string): Promise<void>;
  sendImage(to: string, image: Buffer, mimeType?: string, caption?: string): Promise<void>;
}

export interface MetaConfig {
  phoneNumberId: string;
  accessToken: string;
  graphVersion?: string;
}

/** Real WhatsApp Cloud API client (graph.facebook.com). */
export class MetaWhatsAppClient implements WhatsAppClient {
  private base: string;
  constructor(private cfg: MetaConfig) {
    this.base = `https://graph.facebook.com/${cfg.graphVersion ?? "v21.0"}`;
  }
  private auth() {
    return { Authorization: `Bearer ${this.cfg.accessToken}` };
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    const meta = await fetch(`${this.base}/${mediaId}`, { headers: this.auth() });
    if (!meta.ok) throw new Error(`media lookup ${meta.status}`);
    const { url } = (await meta.json()) as { url: string };
    const bin = await fetch(url, { headers: this.auth() });
    if (!bin.ok) throw new Error(`media download ${bin.status}`);
    return Buffer.from(await bin.arrayBuffer());
  }

  /** Upload bytes to the media endpoint, returning a media id for sending. */
  private async uploadMedia(bytes: Buffer, mimeType: string, filename: string): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);
    form.append("type", mimeType);
    form.append("messaging_product", "whatsapp");
    const res = await fetch(`${this.base}/${this.cfg.phoneNumberId}/media`, { method: "POST", headers: this.auth(), body: form });
    if (!res.ok) throw new Error(`media upload ${res.status}`);
    return ((await res.json()) as { id: string }).id;
  }

  private async send(payload: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${this.base}/${this.cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { ...this.auth(), "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
    if (!res.ok) throw new Error(`send ${res.status}: ${await res.text()}`);
  }

  async sendText(to: string, text: string): Promise<void> {
    await this.send({ to, type: "text", text: { body: text } });
  }
  async sendAudio(to: string, audio: Buffer, mimeType = "audio/ogg"): Promise<void> {
    const id = await this.uploadMedia(audio, mimeType, "reply.ogg");
    await this.send({ to, type: "audio", audio: { id } });
  }
  async sendImage(to: string, image: Buffer, mimeType = "image/png", caption?: string): Promise<void> {
    const id = await this.uploadMedia(image, mimeType, "card.png");
    await this.send({ to, type: "image", image: { id, ...(caption ? { caption } : {}) } });
  }
}
