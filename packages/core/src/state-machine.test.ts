import { describe, expect, it } from "vitest";
import { ApplicationStatusSchema, type ApplicationStatus } from "./models/application.js";
import {
  APPLICATION_TRANSITIONS,
  TERMINAL_STATUSES,
  isTerminalStatus,
  validateTransition,
} from "./state-machine.js";

const ALL_STATUSES = ApplicationStatusSchema.options;

describe("application state machine", () => {
  it("defines transitions for every status", () => {
    expect(Object.keys(APPLICATION_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("only transitions to known statuses", () => {
    for (const targets of Object.values(APPLICATION_TRANSITIONS)) {
      for (const target of targets) {
        expect(ALL_STATUSES).toContain(target);
      }
    }
  });

  it("every status is reachable from discovered", () => {
    const reachable = new Set<ApplicationStatus>(["discovered"]);
    const queue: ApplicationStatus[] = ["discovered"];
    while (queue.length > 0) {
      for (const next of APPLICATION_TRANSITIONS[queue.pop()!]) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
    expect([...reachable].sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("terminal statuses allow no transitions", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(APPLICATION_TRANSITIONS[status]).toEqual([]);
      expect(isTerminalStatus(status)).toBe(true);
    }
  });

  it("ghosted is not terminal (revivable)", () => {
    expect(isTerminalStatus("ghosted")).toBe(false);
    expect(validateTransition("ghosted", "screen").valid).toBe(true);
  });

  it("allows the happy path end to end", () => {
    const path: ApplicationStatus[] = [
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
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(validateTransition(path[i]!, path[i + 1]!)).toEqual({ valid: true });
    }
  });

  it("allows forward skips on the pre-application chain", () => {
    expect(validateTransition("discovered", "applied").valid).toBe(true);
  });

  it("rejects skipping the process (applied → offer)", () => {
    const result = validateTransition("applied", "offer");
    expect(result.valid).toBe(false);
  });

  it("rejects same-state transitions", () => {
    const result = validateTransition("applied", "applied");
    expect(result).toMatchObject({ valid: false });
  });

  it("rejects any transition out of a terminal status", () => {
    for (const status of TERMINAL_STATUSES) {
      for (const target of ALL_STATUSES) {
        if (target === status) continue;
        expect(validateTransition(status, target).valid).toBe(false);
      }
    }
  });

  it("explains rejections", () => {
    const result = validateTransition("offer", "screen");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('"offer" → "screen"');
    }
  });
});
