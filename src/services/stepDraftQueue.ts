// Shared across mounted editors so route changes cannot overtake an older write.
const queues = new Map<string, Promise<void>>();
export function waitForStepDraftTasks(key: string): Promise<void> {
  return queues.get(key) ?? Promise.resolve();
}
export function queueStepDraftTask(key: string, task: () => Promise<void>): Promise<void> {
  const next = waitForStepDraftTasks(key).catch(() => {}).then(task);
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}
