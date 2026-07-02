// Type-only imports — erased at build, so NO runtime code (rules engine, EMPTY_PROFILE,
// thresholds) from @urimai/types ever reaches the browser bundle.
import type { Profile, Verdict } from "@urimai/types";

export type { Profile, Verdict };

export type ProfileField = keyof Profile;

/** Scheme display metadata from GET /api/schemes (no thresholds / rule logic). */
export interface SchemeMeta {
  id: string;
  name: string;
  nameTamil: string;
  benefit: string;
  department: string;
  applyAt: string;
  documents: Array<{ id: string; nameTamil: string; nameEnglish: string; whereToGet: string }>;
  verified: boolean;
}

export interface Assessment {
  profile: Profile;
  verdicts: Verdict[];
}
