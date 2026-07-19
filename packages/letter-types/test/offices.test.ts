import { describe, it, expect } from "vitest";
import type { Office } from "@urimai/types";
import { hasUsableAddress, pickCcOffices, pickToOffice } from "../src/offices.js";

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
