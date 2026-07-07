import { describe, expect, it } from "vitest";
import { CompanySchema, normalizeCompanyKey } from "./company.js";
import { SCHEMA_VERSION } from "./common.js";

describe("CompanySchema", () => {
  it("accepts a valid company", () => {
    const company = {
      id: "com_01",
      schemaVersion: SCHEMA_VERSION,
      name: "Acme Corp",
      normalizedKey: "acme",
      website: "https://acme.example",
      createdAt: "2026-07-01T10:00:00Z",
      updatedAt: "2026-07-01T10:00:00Z",
    };
    expect(CompanySchema.parse(company)).toEqual(company);
  });

  it("rejects an empty normalizedKey", () => {
    expect(
      CompanySchema.safeParse({
        id: "com_01",
        schemaVersion: SCHEMA_VERSION,
        name: "Acme",
        normalizedKey: "",
        createdAt: "2026-07-01T10:00:00Z",
        updatedAt: "2026-07-01T10:00:00Z",
      }).success,
    ).toBe(false);
  });
});

describe("normalizeCompanyKey", () => {
  it("unifies name variants", () => {
    expect(normalizeCompanyKey("Acme Corp.")).toBe("acme");
    expect(normalizeCompanyKey("ACME Corporation")).toBe("acme");
    expect(normalizeCompanyKey("Acme, Inc.")).toBe("acme");
  });

  it("strips stacked legal suffixes", () => {
    expect(normalizeCompanyKey("Acme Co Ltd")).toBe("acme");
  });

  it("removes diacritics", () => {
    expect(normalizeCompanyKey("Café Inc.")).toBe("cafe");
  });

  it("joins multi-word names with hyphens", () => {
    expect(normalizeCompanyKey("Initech Global Services GmbH")).toBe(
      "initech-global-services",
    );
  });

  it("keeps a name that is only a legal suffix", () => {
    expect(normalizeCompanyKey("Limited")).toBe("limited");
  });
});
