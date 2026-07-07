import type { ApplicationStatus } from "./models/application.js";

/**
 * Application lifecycle state machine (SDD §12).
 *
 * The transition table is data so it stays inspectable and exhaustively
 * testable. Forward skips are allowed on the pre-application chain (a user
 * may import a job they already applied to); `ghosted` is revivable because
 * late replies are a real scenario.
 */
export const APPLICATION_TRANSITIONS: Readonly<
  Record<ApplicationStatus, readonly ApplicationStatus[]>
> = {
  discovered: ["interested", "preparing", "applied", "withdrawn"],
  interested: ["preparing", "applied", "withdrawn"],
  preparing: ["applied", "withdrawn"],
  applied: ["screen", "tech", "onsite", "offer_pending", "rejected", "withdrawn", "ghosted"],
  screen: ["tech", "onsite", "offer_pending", "rejected", "withdrawn", "ghosted"],
  tech: ["onsite", "offer_pending", "rejected", "withdrawn", "ghosted"],
  onsite: ["offer_pending", "offer", "rejected", "withdrawn", "ghosted"],
  offer_pending: ["offer", "rejected", "withdrawn", "ghosted"],
  offer: ["accepted", "declined", "rejected"],
  accepted: [],
  declined: [],
  rejected: [],
  withdrawn: [],
  ghosted: ["screen", "tech", "onsite", "offer_pending", "rejected"],
};

/** Statuses from which no transition exists. (`ghosted` is not terminal: it is revivable.) */
export const TERMINAL_STATUSES: readonly ApplicationStatus[] = [
  "accepted",
  "declined",
  "rejected",
  "withdrawn",
];

export function isTerminalStatus(status: ApplicationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export type TransitionValidation =
  | { valid: true }
  | { valid: false; reason: string };

export function validateTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): TransitionValidation {
  if (from === to) {
    return { valid: false, reason: `application is already "${from}"` };
  }
  if (!APPLICATION_TRANSITIONS[from].includes(to)) {
    return {
      valid: false,
      reason: `invalid transition "${from}" → "${to}" (allowed: ${
        APPLICATION_TRANSITIONS[from].join(", ") || "none — terminal status"
      })`,
    };
  }
  return { valid: true };
}
