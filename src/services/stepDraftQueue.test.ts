import { expect, it } from "vitest";
import { queueStepDraftTask, waitForStepDraftTasks } from "./stepDraftQueue";

it("finishes writes before clearing, including across editor instances", async () => {
  const events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const write = queueStepDraftTask("user:date", async () => { await gate; events.push("write"); });
  const clear = queueStepDraftTask("user:date", async () => { events.push("clear"); });
  const read = waitForStepDraftTasks("user:date").then(() => events.push("read"));
  release(); await Promise.all([write, clear, read]); expect(events).toEqual(["write","clear","read"]);
});
it("isolates account/date queues and recovers after a failed write", async () => {
  await expect(queueStepDraftTask("failed:date", async () => { throw Error("storage"); })).rejects.toThrow("storage");
  const events: string[] = [];
  await queueStepDraftTask("other:date", async () => { events.push("other"); });
  await queueStepDraftTask("failed:date", async () => { events.push("recovered"); });
  expect(events).toEqual(["other","recovered"]);
});
