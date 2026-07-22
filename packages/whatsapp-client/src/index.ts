/**
 * @urimai/whatsapp-client — WhatsApp Cloud API plumbing (webhook verification, inbound
 * normalization, outbound Meta client). Extracted from apps/whatsapp so the Madal letters
 * channel can share one client behind one number (LETTERS_BRIEF.md §3).
 */
export {
  MetaWhatsAppClient,
  parseInbound,
  verifyChallenge,
  verifySignature,
  type InboundMessage,
  type ListRow,
  type MetaConfig,
  type WhatsAppClient,
} from "./whatsapp.js";
