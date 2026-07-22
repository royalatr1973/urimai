import { describe, it, expect } from "vitest";
import type { Office } from "@urimai/types";
import { hasUsableAddress, officeLocality, pickCcOffices, pickToOffice } from "../src/offices.js";

const office = (o: Partial<Office>): Office => ({
  id: "x",
  designation: "The Officer",
  designationTamil: "அலுவலர்",
  department: "Dept",
  addressLines: ["Some Street", "Chennai"],
  pincode: "600001",
  phone: null,
  email: null,
  level: "state",
  district: null,
  handles: [],
  ccFor: [],
  version: 1,
  source: "https://example.gov.in",
  verified: false,
  notes: "",
  ...o,
});

const DIRECTORY: Office[] = [
  office({ id: "cm_cell", designationTamil: "முதல்வரின் சிறப்புப் பிரிவு", handles: ["generic_petition"], ccFor: ["generic_petition", "civic_grievance", "police_complaint"] }),
  office({ id: "cma", designationTamil: "நகராட்சி நிர்வாக ஆணையர்", handles: ["civic_grievance"], ccFor: ["civic_grievance"] }),
  office({ id: "shrc", designationTamil: "மனித உரிமை ஆணையம்", handles: ["human_rights_complaint"], ccFor: ["police_complaint"] }),
  office({ id: "scd_placeholder", designationTamil: "மாற்றுத்திறனாளிகள் ஆணையர்", addressLines: ["ADDRESS_TO_VERIFY"], pincode: null, handles: ["scheme_grievance"], ccFor: ["scheme_grievance"] }),
];

describe("officeLocality — the To office's jurisdiction, never the sender's address", () => {
  const facts = (entities: Record<string, string>, extra: Record<string, string> = {}) =>
    ({ letterTypeId: null, language: null, entities, ...extra }) as never;

  it("picks a jurisdiction entity (station/taluk/village) in priority order", () => {
    expect(officeLocality(facts({ police_station: "அம்பத்தூர் காவல் நிலையம்", taluk: "அம்பத்தூர்" }))).toBe(
      "அம்பத்தூர் காவல் நிலையம்",
    );
    expect(officeLocality(facts({ taluk: "பொன்னேரி", village: "மின்ஜூர்" }))).toBe("பொன்னேரி");
    expect(officeLocality(facts({ village: "மின்ஜூர்" }))).toBe("மின்ஜூர்");
  });

  it("NEVER uses the sender's address (the reported bug)", () => {
    expect(officeLocality(facts({}, { sender_address: "எண் 5, காந்தி தெரு, சென்னை" }))).toBeNull();
    // Even with an incident scene present, the sender's address is not the office's.
    expect(officeLocality(facts({}, { sender_address: "என் வீடு", incident_place: "என் வீடு" }))).toBeNull();
  });

  it("returns null when there is no jurisdiction hint (designation prints alone)", () => {
    expect(officeLocality(facts({}))).toBeNull();
    expect(officeLocality({ letterTypeId: null, language: null } as never)).toBeNull();
  });
});

describe("pickToOffice", () => {
  it("picks the office that handles the letter type", () => {
    expect(pickToOffice(DIRECTORY, "civic_grievance")?.id).toBe("cma");
  });

  it("NEVER picks a placeholder address as the To — better the hint than a fake address", () => {
    expect(hasUsableAddress(DIRECTORY[3]!)).toBe(false);
    expect(pickToOffice(DIRECTORY, "scheme_grievance")).toBeNull();
  });

  it("returns null when nothing handles the type", () => {
    expect(pickToOffice(DIRECTORY, "wage_complaint")).toBeNull();
  });
});

describe("pickCcOffices", () => {
  it("subject-matter office first, general CM cell second, capped at 2", () => {
    expect(pickCcOffices(DIRECTORY, "civic_grievance").map((o) => o.id)).toEqual(["cma", "cm_cell"]);
  });

  it("excludes the To office from its own CC list", () => {
    expect(pickCcOffices(DIRECTORY, "civic_grievance", "cma").map((o) => o.id)).toEqual(["cm_cell"]);
  });

  it("a placeholder-address office can still be CC'd by designation", () => {
    expect(pickCcOffices(DIRECTORY, "scheme_grievance").map((o) => o.id)).toEqual(["scd_placeholder"]);
  });
});
