import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EXTRACT_JOB_TASK } from "./extract-job.js";
import { JOB_INSIGHTS_TASK } from "./job-insights.js";
import locks from "./prompt-locks.json";

/**
 * Prompt regression pressure (SDD §20, M3 "eval fixtures locked"): a prompt
 * is part of a task's versioned contract. Editing instructions without
 * bumping the task version breaks this test on purpose — bump the version,
 * update the lock entry, and re-run the eval set against a real provider.
 */
describe("prompt locks", () => {
  const tasks = [EXTRACT_JOB_TASK, JOB_INSIGHTS_TASK];

  it.each(tasks.map((t) => [`${t.id}@${t.version}`, t] as const))(
    "%s instructions match the committed lock",
    (key, task) => {
      const hash = createHash("sha256").update(task.instructions).digest("hex");
      expect(
        (locks as Record<string, string>)[key],
        `prompt for ${key} changed — bump the task version and update prompt-locks.json`,
      ).toBe(hash);
    },
  );

  it("every task version has a lock entry", () => {
    for (const task of tasks) {
      expect(locks).toHaveProperty(`${task.id}@${task.version}`);
    }
  });
});
