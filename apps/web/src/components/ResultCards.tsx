import { FIELD_BY_KEY } from "../fields";
import type { SchemeMeta, Verdict } from "../types";

const STATUS: Record<Verdict["status"], { ta: string; en: string; cls: string }> = {
  eligible: { ta: "தகுதி உண்டு", en: "Eligible", cls: "bg-green-100 text-green-800 border-green-300" },
  need_info: { ta: "மேலும் தகவல் தேவை", en: "Need more info", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  not_eligible: { ta: "தகுதி இல்லை", en: "Not eligible", cls: "bg-stone-200 text-stone-600 border-stone-300" },
};

export function ResultCards({ verdicts, schemesById }: { verdicts: Verdict[]; schemesById: Record<string, SchemeMeta> }) {
  // Eligible first, then need_info, then not_eligible.
  const order: Record<Verdict["status"], number> = { eligible: 0, need_info: 1, not_eligible: 2 };
  const sorted = [...verdicts].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-ink">முடிவுகள் · Results</h2>
      <div className="grid grid-cols-1 gap-4">
        {sorted.map((v) => {
          const s = schemesById[v.schemeId];
          const st = STATUS[v.status];
          return (
            <article key={v.schemeId} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{s?.nameTamil ?? v.schemeId}</h3>
                  <p className="text-xs text-stone-500">{s?.name}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.ta}</span>
              </div>

              {s?.benefit && <p className="mt-2 text-sm text-leaf">{s.benefit}</p>}

              {v.reasons.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-stone-600">
                  {v.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}

              {v.status === "need_info" && v.missingFields.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  தேவையான தகவல்: {v.missingFields.map((f) => FIELD_BY_KEY[f]?.ta ?? f).join(", ")}
                </p>
              )}

              {v.status === "eligible" && s?.documents?.length > 0 && (
                <div className="mt-3 border-t border-stone-100 pt-2">
                  <p className="mb-1 text-xs font-medium text-stone-500">தேவையான ஆவணங்கள் · Documents</p>
                  <ul className="space-y-0.5 text-sm text-stone-700">
                    {s.documents.map((d) => (
                      <li key={d.id}>
                        ☑ {d.nameTamil} <span className="text-xs text-stone-400">({d.whereToGet})</span>
                      </li>
                    ))}
                  </ul>
                  {s.applyAt && <p className="mt-2 text-xs text-stone-500">விண்ணப்பிக்க: {s.applyAt}</p>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
