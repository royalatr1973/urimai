import { describe, it, expect } from "vitest";
import { SEED_SCHEMES } from "@urimai/db";
import { renderDocumentCardSvg } from "../src/card.js";

describe("renderDocumentCardSvg", () => {
  const widow = SEED_SCHEMES.find((s) => s.id === "widow")!;

  it("produces an SVG titled with the scheme's Tamil name", () => {
    const svg = renderDocumentCardSvg(widow);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(widow.nameTamil);
  });

  it("shows every document (Tamil name + where to get)", () => {
    const svg = renderDocumentCardSvg(widow);
    for (const d of widow.documents) {
      expect(svg).toContain(d.nameTamil);
      expect(svg).toContain(d.whereToGet);
    }
  });
});
