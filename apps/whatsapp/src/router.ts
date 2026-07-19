/**
 * Same-number app routing (LETTERS_BRIEF §3): ONE webhook, one handler entry point,
 * two apps behind it. The router — and ONLY the router — knows both apps exist; the
 * orchestrators never learn about each other.
 *
 * A fresh session is greeted with the schemes-or-letter question; intent keywords in
 * any un-routed message switch mode immediately (mid-greeting too). Once routed, every
 * turn goes to that app until the letter completes or the user says the reset word.
 *
 * Reset semantics: on a Urimai-routed session the reset word keeps its curator-approved
 * live behavior (straight into the first question). Everywhere else it clears the route
 * and re-greets, so a shared phone can hand between apps AND between people.
 */
import { isHelpRequest, isResetRequest, type EscalationQueue } from "@urimai/escalation";
import type { InboundMessage, WhatsAppClient } from "@urimai/whatsapp-client";
import type { MadalHandler } from "./madal.js";

export type AppRoute = "urimai" | "madal";

/** Same minimal store contract as the orchestrators (Redis in production). */
export interface RouteStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

// Intent keywords (§3). Madal wins when both match: "திட்டம் பத்தி புகார்" is a
// grievance LETTER about a scheme, not a scheme check.
const MADAL_KEYWORDS = ["கடிதம்", "கடுதாசி", "letter", "complaint", "புகார்", "மனு ", "மனு.", "petition", "விண்ணப்பம்", "எழுத", "rti"];
const URIMAI_KEYWORDS = ["திட்டம்", "scheme", "உதவித்தொகை", "பணம்", "பென்ஷன்", "பென்சன்", "ஓய்வூதியம்", "pension", "தகுதி", "eligib", "உரிமைத் தொகை", "மகளிர்"];

export function detectAppIntent(text: string): AppRoute | null {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return null;
  if (MADAL_KEYWORDS.some((k) => t.includes(k)) || t === "மனு") return "madal";
  if (URIMAI_KEYWORDS.some((k) => t.includes(k))) return "urimai";
  return null;
}

const MSG = {
  greeting:
    "வணக்கம்! இது ஒரு உதவி சேவை, அரசு அல்ல. என்ன உதவி வேண்டும்? " +
    "அரசு நலத்திட்டங்களுக்கான தகுதியை அறிய 'திட்டம்' என்று சொல்லுங்கள்; " +
    "கடிதம் அல்லது புகார் எழுத 'கடிதம்' என்று சொல்லுங்கள்.",
  resetAck: "சரி, புதிதாகத் தொடங்குகிறோம். ",
  unsupported: "தயவுசெய்து உங்கள் நிலையை குரல் செய்தியாக அல்லது எழுத்தாக அனுப்புங்கள்.",
  voiceNotReady: "தற்போது குரல் செய்திகளை கேட்க முடியவில்லை — தயவுசெய்து எழுத்தாக அனுப்புங்கள்.",
  handoff: "நேரடி உதவிக்கு, உங்கள் அருகிலுள்ள இ-சேவை மையம் அல்லது வட்டாட்சியர் அலுவலகத்தை அணுகவும்.",
};

/** "greeted" = we asked the mode question and are awaiting a (possibly unclear) reply. */
type StoredRoute = AppRoute | "greeted";

export interface RouterDeps {
  routeStore: RouteStore;
  /** Inbound normalization (voice → text) — done ONCE here, upstream of both apps. */
  toText: (msg: InboundMessage) => Promise<string | null>;
  speak: (to: string, tamil: string) => Promise<void>;
  /** The existing Urimai channel handler, reused unchanged (its consent gate included). */
  urimai: { handleInbound(msg: InboundMessage): Promise<void> };
  madal: MadalHandler;
  escalation: EscalationQueue;
  whatsapp: WhatsAppClient;
  helplineText?: string;
  now?: () => string;
  /** Route memory TTL — matches the short shared-phone session TTL. */
  ttlSeconds?: number;
}

const routeKey = (from: string) => `madal:route:${from}`;

export function createAppRouter(deps: RouterDeps) {
  const ttl = deps.ttlSeconds ?? 30 * 60;
  const now = deps.now ?? (() => new Date().toISOString());

  const getRoute = async (from: string) => (await deps.routeStore.get(routeKey(from))) as StoredRoute | null;
  const setRoute = (from: string, r: StoredRoute) => deps.routeStore.set(routeKey(from), r, "EX", ttl);
  const clearRoute = (from: string) => deps.routeStore.del(routeKey(from));

  /** Forward into the Urimai handler as a TEXT message — voice is already transcribed. */
  const toUrimai = (from: string, text: string) => deps.urimai.handleInbound({ from, kind: "text", text });

  /** A message that is JUST a mode word ("கடிதம்") vs one already carrying the story. */
  const isBareIntent = (text: string) => text.trim().length <= 25;

  async function handleInbound(msg: InboundMessage): Promise<void> {
    const text = await deps.toText(msg);
    if (text === null) {
      await deps.whatsapp.sendText(msg.from, msg.kind === "audio" ? MSG.voiceNotReady : MSG.unsupported);
      return;
    }

    const route = await getRoute(msg.from);

    if (isResetRequest(text)) {
      if (route === "urimai") {
        await toUrimai(msg.from, text); // curator-approved live reset flow, unchanged
        return;
      }
      await clearRoute(msg.from);
      await deps.madal.reset(msg.from);
      await deps.speak(msg.from, MSG.resetAck + MSG.greeting);
      return;
    }

    if (route === "urimai") {
      await toUrimai(msg.from, text);
      return;
    }
    if (route === "madal") {
      await deps.madal.handleText(msg.from, text);
      return;
    }

    // --- un-routed: greeting phase -------------------------------------------
    // "help" must reach a human even before any app is chosen.
    if (isHelpRequest(text)) {
      await deps.escalation.enqueue({ from: msg.from, text, reason: "help_requested", at: now() });
      if (deps.helplineText) await deps.whatsapp.sendText(msg.from, deps.helplineText);
      await deps.speak(msg.from, MSG.handoff);
      return;
    }

    const intent = detectAppIntent(text);
    if (intent === "madal") {
      await setRoute(msg.from, "madal");
      // A bare "கடிதம்" opens with the listen prompt; a message already carrying the
      // story goes straight into the orchestrator (classification, §7.3).
      if (isBareIntent(text)) await deps.madal.start(msg.from);
      else await deps.madal.handleText(msg.from, text);
      return;
    }
    if (intent === "urimai") {
      await setRoute(msg.from, "urimai");
      await toUrimai(msg.from, text);
      return;
    }

    if (route === "greeted") {
      // Second unclear message: default to Urimai — its consent gate + extractor
      // handle arbitrary first utterances gracefully, and its opening explains itself.
      await setRoute(msg.from, "urimai");
      await toUrimai(msg.from, text);
      return;
    }

    await setRoute(msg.from, "greeted");
    await deps.speak(msg.from, MSG.greeting);
  }

  return { handleInbound, clearRoute };
}

export type AppRouter = ReturnType<typeof createAppRouter>;
