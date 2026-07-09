/**
 * The "text-free" document card: a picture the user can recognize while the voice note
 * walks them through it. Renders an SVG (pure + testable). In production a rasterizer
 * (resvg/sharp) converts it to PNG before sending — Meta accepts PNG/JPEG, not SVG — and
 * the placeholder pictographs get swapped for real recognizable document photos
 * (imageAssetId, Phase 5 asset work). The voice is the literacy-free path; the picture is
 * the recognition aid.
 */
import type { Scheme } from "@urimai/types";

// Simple pictographs per known document id (stand-ins for real photos).
const ICON: Record<string, string> = {
  aadhaar: "🪪",
  ration_card: "🪪",
  bank_passbook: "🏦",
  residence_proof: "🏠",
  age_proof: "📅",
  income_cert: "📄",
  death_cert: "📜",
  disability_cert: "♿",
};

export function renderDocumentCardSvg(scheme: Scheme): string {
  const docs = scheme.documents;
  const rowH = 64;
  const top = 96;
  const height = top + docs.length * rowH + 24;
  const width = 640;

  const rows = docs
    .map((d, i) => {
      const y = top + i * rowH;
      const icon = ICON[d.id] ?? "📋";
      return `
    <g transform="translate(32 ${y})">
      <rect x="0" y="0" width="${width - 64}" height="${rowH - 12}" rx="10" fill="#FFFFFF" stroke="#E0DACB"/>
      <text x="20" y="34" font-size="30">${icon}</text>
      <text x="68" y="28" font-size="20" fill="#20242B" font-family="'Noto Sans Tamil', sans-serif">${escapeXml(d.nameTamil)}</text>
      <text x="68" y="46" font-size="13" fill="#9B8553" font-family="'Noto Sans Tamil', sans-serif">${escapeXml(d.whereToGet)}</text>
    </g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#F4F1EA"/>
  <rect x="0" y="0" width="${width}" height="72" fill="#2F7D4F"/>
  <text x="32" y="46" font-size="26" fill="#F4F1EA" font-family="'Noto Sans Tamil', sans-serif">${escapeXml(scheme.nameTamil)}</text>
  ${rows}
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

/**
 * Text fallback for the document checklist. Meta's media API accepts PNG/JPEG only, so
 * without a rasterizer the SVG card is unsendable (upload 400) — this Tamil text carries
 * the same information: which papers to bring and where each is issued.
 */
export function documentChecklistTextTamil(scheme: Scheme): string {
  const lines = scheme.documents.map((d) => `${ICON[d.id] ?? "📋"} ${d.nameTamil} (${d.whereToGet})`);
  return `${scheme.nameTamil} — தேவையான ஆவணங்கள்:\n${lines.join("\n")}`;
}
