import { describe, it, expect, vi } from "vitest";
import type { InboundMessage } from "@urimai/whatsapp-client";
import { createAppRouter, detectAppIntent, type RouteStore } from "../src/router.js";

function memoryRouteStore(): RouteStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k) => map.get(k) ?? null,
    set: async (k, v) => void map.set(k, v),
    del: async (k) => void map.delete(k),
  };
}

const text = (from: string, t: string): InboundMessage => ({ from, kind: "text", text: t });

function makeRouter() {
  const routeStore = memoryRouteStore();
  const spoken: string[] = [];
  const urimai = { handleInbound: vi.fn(async (_m: InboundMessage) => {}) };
  const madal = {
    handleText: vi.fn(async (_f: string, _t: string) => {}),
    start: vi.fn(async (_f: string) => {}),
    reset: vi.fn(async (_f: string) => {}),
  };
  const escalation = { enqueue: vi.fn(async () => {}) };
  const whatsapp = {
    downloadMedia: vi.fn(async () => Buffer.from("")),
    sendText: vi.fn(async () => {}),
    sendAudio: vi.fn(async () => {}),
    sendImage: vi.fn(async () => {}),
    sendDocument: vi.fn(async () => {}),
  };
  const router = createAppRouter({
    routeStore,
    toText: async (m) => (m.kind === "text" ? (m.text ?? "") : null),
    speak: async (_to, tamil) => void spoken.push(tamil),
    urimai,
    madal,
    escalation,
    whatsapp,
    now: () => "2026-07-19T00:00:00Z",
  });
  return { router, routeStore, spoken, urimai, madal, escalation, whatsapp };
}

describe("detectAppIntent (§3 keywords)", () => {
  it("routes letter words to madal and scheme words to urimai", () => {
    expect(detectAppIntent("எனக்கு ஒரு கடிதம் எழுதணும்")).toBe("madal");
    expect(detectAppIntent("போலீஸ்ல complaint பண்ணணும்")).toBe("madal");
    expect(detectAppIntent("புகார் கொடுக்கணும்")).toBe("madal");
    expect(detectAppIntent("எந்த திட்டம் கிடைக்கும்?")).toBe("urimai");
    expect(detectAppIntent("pension வருமா?")).toBe("urimai");
    expect(detectAppIntent("உதவித்தொகை பத்தி கேக்கணும்")).toBe("urimai");
  });

  it("madal wins when both appear — a grievance letter ABOUT a scheme", () => {
    expect(detectAppIntent("என் ஓய்வூதியம் நிக்குது, அதுக்கு ஒரு புகார் கடிதம் வேணும்")).toBe("madal");
  });

  it("unclear text is null", () => {
    expect(detectAppIntent("வணக்கம்")).toBeNull();
  });
});

describe("app router (§3 — one webhook, two apps)", () => {
  it("greets an unclear fresh contact with the mode question, touching neither app", async () => {
    const { router, spoken, urimai, madal } = makeRouter();
    await router.handleInbound(text("911", "வணக்கம்"));
    expect(spoken[0]).toContain("திட்டம்");
    expect(spoken[0]).toContain("கடிதம்");
    expect(urimai.handleInbound).not.toHaveBeenCalled();
    expect(madal.handleText).not.toHaveBeenCalled();
  });

  it("a bare 'கடிதம்' after (or instead of) the greeting opens the Madal listen prompt", async () => {
    const { router, madal } = makeRouter();
    await router.handleInbound(text("911", "கடிதம்"));
    expect(madal.start).toHaveBeenCalledWith("911");
    expect(madal.handleText).not.toHaveBeenCalled();
  });

  it("a first message already carrying the story goes straight into the Madal orchestrator", async () => {
    const { router, madal } = makeRouter();
    const story = "எங்க தெருவுல சாக்கடை ஓவர்ஃப்ளோ ஆகுது, முனிசிபாலிட்டிக்கு ஒரு புகார் கடிதம் எழுதணும்";
    await router.handleInbound(text("911", story));
    expect(madal.handleText).toHaveBeenCalledWith("911", story);
    expect(madal.start).not.toHaveBeenCalled();
  });

  it("scheme intent routes to the Urimai handler as a TEXT message and sticks", async () => {
    const { router, urimai, madal } = makeRouter();
    await router.handleInbound(text("911", "எனக்கு என்ன திட்டம் கிடைக்கும்?"));
    expect(urimai.handleInbound).toHaveBeenCalledWith({ from: "911", kind: "text", text: "எனக்கு என்ன திட்டம் கிடைக்கும்?" });

    // Later turns — even ones containing letter words — stay with Urimai until reset.
    await router.handleInbound(text("911", "எனக்கு புகார் இல்லை, வயசு 67"));
    expect(urimai.handleInbound).toHaveBeenCalledTimes(2);
    expect(madal.handleText).not.toHaveBeenCalled();
  });

  it("once routed to Madal, every turn goes there — scheme words included", async () => {
    const { router, madal, urimai } = makeRouter();
    await router.handleInbound(text("911", "கடிதம்"));
    await router.handleInbound(text("911", "என் ஓய்வூதியம் நிக்குது அதான் பிரச்சனை"));
    expect(madal.handleText).toHaveBeenCalledWith("911", "என் ஓய்வூதியம் நிக்குது அதான் பிரச்சனை");
    expect(urimai.handleInbound).not.toHaveBeenCalled();
  });

  it("a second unclear message after the greeting defaults to Urimai", async () => {
    const { router, urimai } = makeRouter();
    await router.handleInbound(text("911", "வணக்கம்"));
    await router.handleInbound(text("911", "நான் என்ன பண்றது சொல்லுங்க")); // still no clear keyword
    expect(urimai.handleInbound).toHaveBeenCalledWith({ from: "911", kind: "text", text: "நான் என்ன பண்றது சொல்லுங்க" });
  });

  it("'help' before any routing escalates to a human", async () => {
    const { router, escalation, spoken, urimai, madal } = makeRouter();
    await router.handleInbound(text("911", "help"));
    expect(escalation.enqueue).toHaveBeenCalledOnce();
    expect(spoken.join()).toContain("இ-சேவை");
    expect(urimai.handleInbound).not.toHaveBeenCalled();
    expect(madal.handleText).not.toHaveBeenCalled();
  });

  it("reset on a Madal route clears it, resets the letters session, and re-greets", async () => {
    const { router, routeStore, madal, spoken } = makeRouter();
    await router.handleInbound(text("911", "கடிதம்"));
    expect(routeStore.map.size).toBe(1);
    await router.handleInbound(text("911", "புதிது"));
    expect(madal.reset).toHaveBeenCalledWith("911");
    expect(routeStore.map.size).toBe(0);
    expect(spoken.at(-1)).toContain("புதிதாகத் தொடங்குகிறோம்");
  });

  it("reset on a Urimai route keeps the curator-approved live flow (forwarded, route kept)", async () => {
    const { router, urimai, routeStore } = makeRouter();
    await router.handleInbound(text("911", "திட்டம் பார்க்கணும்"));
    await router.handleInbound(text("911", "புதிது"));
    expect(urimai.handleInbound).toHaveBeenCalledWith({ from: "911", kind: "text", text: "புதிது" });
    expect(routeStore.map.get("madal:route:911")).toBe("urimai");
  });

  it("lettersOnly: never greets or routes to schemes — every message drives letters", async () => {
    const routeStore = memoryRouteStore();
    const spoken: string[] = [];
    const urimai = { handleInbound: vi.fn(async (_m: InboundMessage) => {}) };
    const madal = { handleText: vi.fn(async () => {}), start: vi.fn(async () => {}), reset: vi.fn(async () => {}) };
    const escalation = { enqueue: vi.fn(async () => {}) };
    const whatsapp = {
      downloadMedia: vi.fn(async () => Buffer.from("")),
      sendText: vi.fn(async () => {}),
      sendAudio: vi.fn(async () => {}),
      sendImage: vi.fn(async () => {}),
      sendDocument: vi.fn(async () => {}),
    };
    const router = createAppRouter({
      routeStore,
      toText: async (m) => (m.kind === "text" ? (m.text ?? "") : null),
      speak: async (_to, t) => void spoken.push(t),
      urimai,
      madal,
      escalation,
      whatsapp,
      now: () => "2026-07-22T00:00:00Z",
      lettersOnly: true,
    });

    // Fresh bare opener → letters listen prompt, NOT the schemes-or-letter greeting.
    await router.handleInbound(text("911", "வணக்கம்"));
    expect(madal.start).toHaveBeenCalledWith("911");
    expect(spoken.join()).not.toContain("திட்டம்");
    expect(urimai.handleInbound).not.toHaveBeenCalled();

    // A scheme keyword is ignored as routing — stays in letters.
    await router.handleInbound(text("911", "எனக்கு பென்ஷன் திட்டம் வேணும்"));
    expect(madal.handleText).toHaveBeenCalledWith("911", "எனக்கு பென்ஷன் திட்டம் வேணும்");
    expect(urimai.handleInbound).not.toHaveBeenCalled();

    // help still escalates.
    await router.handleInbound(text("922", "help"));
    expect(escalation.enqueue).toHaveBeenCalledOnce();
  });

  it("clearRoute (letter completed) makes the next contact a fresh greeting", async () => {
    const { router, spoken, madal } = makeRouter();
    await router.handleInbound(text("911", "கடிதம்"));
    await router.clearRoute("911");
    await router.handleInbound(text("911", "வணக்கம்"));
    expect(spoken.at(-1)).toContain("என்ன உதவி வேண்டும்?");
    expect(madal.handleText).not.toHaveBeenCalled();
  });
});
