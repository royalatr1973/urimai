import { FIELD_META, type FieldMeta } from "../fields";
import type { Profile, ProfileField } from "../types";

type Value = string | number | boolean | null;

interface Props {
  profile: Profile;
  /** Fields the server says still gate an in-scope scheme (verdict.missingFields). */
  gating: Set<string>;
  showAll: boolean;
  onToggleShowAll: () => void;
  onEdit: (key: ProfileField, value: Value) => void;
}

function FieldInput({ meta, value, onEdit }: { meta: FieldMeta; value: Value; onEdit: Props["onEdit"] }) {
  const base = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-leaf focus:outline-none";

  if (meta.kind === "number") {
    return (
      <input
        type="number"
        inputMode="decimal"
        className={base}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => onEdit(meta.key, e.target.value === "" ? null : Number(e.target.value))}
      />
    );
  }

  if (meta.kind === "boolean") {
    const v = value === true ? "true" : value === false ? "false" : "";
    return (
      <select className={base} value={v} onChange={(e) => onEdit(meta.key, e.target.value === "" ? null : e.target.value === "true")}>
        <option value="">தெரியவில்லை · unknown</option>
        <option value="true">ஆம் · yes</option>
        <option value="false">இல்லை · no</option>
      </select>
    );
  }

  // enum
  return (
    <select className={base} value={value === null || value === undefined ? "" : String(value)} onChange={(e) => onEdit(meta.key, e.target.value === "" ? null : e.target.value)}>
      <option value="">தெரியவில்லை · unknown</option>
      {meta.options!.map((o) => (
        <option key={o.value} value={o.value}>
          {o.ta} · {o.en}
        </option>
      ))}
    </select>
  );
}

export function FactFields({ profile, gating, showAll, onToggleShowAll, onEdit }: Props) {
  const isPrimary = (key: ProfileField) => profile[key] !== null || gating.has(key);
  const primary = FIELD_META.filter((f) => isPrimary(f.key));
  const others = FIELD_META.filter((f) => !isPrimary(f.key));

  const render = (meta: FieldMeta) => {
    const needed = gating.has(meta.key) && profile[meta.key] === null;
    return (
      <label key={meta.key} className={`block rounded-lg border p-3 ${needed ? "border-amber-400 bg-amber-50" : "border-stone-200 bg-white"}`}>
        <div className="mb-1 text-sm font-medium text-ink">
          {meta.ta}
          {needed && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[11px] text-amber-900">தேவை · needed</span>}
        </div>
        <div className="mb-1.5 text-xs text-stone-500">{meta.en}</div>
        <FieldInput meta={meta} value={profile[meta.key] as Value} onEdit={onEdit} />
      </label>
    );
  };

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-ink">விவரங்கள் · Facts</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{primary.map(render)}</div>

      {others.length > 0 && (
        <div className="mt-4">
          <button onClick={onToggleShowAll} className="text-sm font-medium text-leaf underline">
            {showAll ? "மற்ற புலங்களை மறை · Hide other fields" : `மற்ற புலங்கள் (${others.length}) · Show more fields`}
          </button>
          {showAll && <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{others.map(render)}</div>}
        </div>
      )}
    </section>
  );
}
