import { describe, expect, it } from "vitest";
import { parseCompensation } from "./compensation.js";

describe("parseCompensation", () => {
  it("parses a euro range with commas", () => {
    expect(parseCompensation("€90,000 – €110,000 per year")).toEqual({
      raw: "€90,000 – €110,000 per year",
      currency: "EUR",
      period: "year",
      min: 90000,
      max: 110000,
    });
  });

  it("parses currency codes and plain ranges", () => {
    expect(parseCompensation("EUR 85000-105000 per year")).toMatchObject({
      currency: "EUR",
      min: 85000,
      max: 105000,
      period: "year",
    });
  });

  it("parses k-suffixed dollar ranges", () => {
    expect(parseCompensation("$120k-$150k")).toMatchObject({
      currency: "USD",
      min: 120000,
      max: 150000,
    });
  });

  it("parses a single figure as a point range", () => {
    expect(parseCompensation("up to £95,000 annually")).toMatchObject({
      currency: "GBP",
      min: 95000,
      max: 95000,
      period: "year",
    });
  });

  it("parses hourly rates below the salary floor", () => {
    expect(parseCompensation("USD 85 per hour")).toMatchObject({
      currency: "USD",
      period: "hour",
      min: 85,
      max: 85,
    });
  });

  it("ignores non-salary numbers", () => {
    const result = parseCompensation("competitive salary, 401k, 30 days vacation");
    expect(result.min).toBeUndefined();
    expect(result.max).toBeUndefined();
  });

  it("always preserves the raw string", () => {
    expect(parseCompensation("a mystery").raw).toBe("a mystery");
  });
});
