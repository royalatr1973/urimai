import { useEffect, useMemo, useRef, useState } from "react";
import { assess, getSchemes, reassess } from "./api";
import { FactFields } from "./components/FactFields";
import { ResultCards } from "./components/ResultCards";
import type { Profile, ProfileField, SchemeMeta, Verdict } from "./types";

export function App() {
  const sessionId = useRef<string>(crypto.randomUUID()).current;
  const [text, setText] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [schemesById, setSchemesById] = useState<Record<string, SchemeMeta>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getSchemes()
      .then(({ schemes }) => setSchemesById(Object.fromEntries(schemes.map((s) => [s.id, s]))))
      .catch(() => setError("திட்ட விவரங்களைப் பெற முடியவில்லை · Could not load schemes"));
  }, []);

  const gating = useMemo(() => new Set<string>(verdicts.flatMap((v) => v.missingFields)), [verdicts]);

  async function onCheck() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const a = await assess(sessionId, text);
      setProfile(a.profile);
      setVerdicts(a.verdicts);
    } catch {
      setError("சேவையைத் தொடர்பு கொள்ள முடியவில்லை · Backend call failed");
    } finally {
      setLoading(false);
    }
  }

  function onEdit(key: ProfileField, value: string | number | boolean | null) {
    if (!profile) return;
    const next = { ...profile, [key]: value } as Profile;
    setProfile(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const a = await reassess(sessionId, next);
        setVerdicts(a.verdicts); // server re-evaluates; engine stays server-side
      } catch {
        setError("மறு மதிப்பீடு தோல்வி · Re-evaluation failed");
      }
    }, 350);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-leaf">உரிமை</h1>
        <p className="text-sm text-stone-600">உங்களுக்கு உரிய அரசு திட்டங்களை அறியுங்கள் · Find the welfare schemes you're entitled to</p>
      </header>

      <section className="mb-6">
        <label className="mb-1 block text-sm font-medium text-ink">உங்கள் நிலையை விவரியுங்கள் · Describe the situation</label>
        <textarea
          className="w-full rounded-lg border border-stone-300 bg-white p-3 text-sm focus:border-leaf focus:outline-none"
          rows={3}
          placeholder="எ.கா: எனக்கு வயசு 67, விதவை, மதுரையில் வசிக்கிறேன், நிலையான வருமானம் இல்லை."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          onClick={onCheck}
          disabled={loading || !text.trim()}
          className="mt-2 rounded-lg bg-leaf px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "பரிசோதிக்கிறது…" : "சரிபார் · Check"}
        </button>
      </section>

      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {profile && (
        <div className="space-y-8">
          <FactFields profile={profile} gating={gating} showAll={showAll} onToggleShowAll={() => setShowAll((s) => !s)} onEdit={onEdit} />
          <ResultCards verdicts={verdicts} schemesById={schemesById} />
        </div>
      )}
    </div>
  );
}
