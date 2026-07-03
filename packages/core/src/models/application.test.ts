import { describe, expect, it } from "vitest";
import {
  ApplicationEventSchema,
  ApplicationSchema,
  ApplicationStatusSchema,
} from "./application.js";
import { SCHEMA_VERSION } from "./common.js";

const validApplication = {
  id: "app_01",
  schemaVersion: SCHEMA_VERSION,
  jobId: "job_01",
  status: "applied",
  createdAt: "2026-07-01T10:00:00Z",
  updatedAt: "2026-07-02T09:00:00Z",
};

describe("ApplicationSchema", () => {
  it("accepts a valid application", () => {
    expect(ApplicationSchema.parse(validApplication)).toEqual(validApplication);
  });

  it("rejects an unknown status", () => {
    expect(
      ApplicationSchema.safeParse({ ...validApplication, status: "pending" })
        .success,
    ).toBe(false);
  });

  it("covers every SDD §12 lifecycle status", () => {
    // Regression guard: the enum must track the SDD state machine exactly.
    expect(ApplicationStatusSchema.options).toEqual([
      "discovered",
      "interested",
      "preparing",
      "applied",
      "screen",
      "tech",
      "onsite",
      "offer_pending",
      "offer",
      "accepted",
      "declined",
      "rejected",
      "withdrawn",
      "ghosted",
    ]);
  });
});

describe("ApplicationEventSchema", () => {
  const validEvent = {
    id: "evt_01",
    applicationId: "app_01",
    seq: 0,
    kind: "status_changed",
    data: { from: "preparing", to: "applied" },
    occurredAt: "2026-07-01T10:00:00Z",
  };

  it("accepts a valid event", () => {
    expect(ApplicationEventSchema.parse(validEvent)).toEqual(validEvent);
  });

  it("rejects a negative sequence number", () => {
    expect(
      ApplicationEventSchema.safeParse({ ...validEvent, seq: -1 }).success,
    ).toBe(false);
  });

  it("rejects an unknown event kind", () => {
    expect(
      ApplicationEventSchema.safeParse({ ...validEvent, kind: "emailed" })
        .success,
    ).toBe(false);
  });
});
