type CleanupBatch = { leaseId: string; paths: string[] };
export interface RecipeCleanupDependencies {
  authorized(request: Request): boolean;
  claim(): Promise<CleanupBatch>;
  remove(paths: string[]): Promise<void>;
  complete(batch: CleanupBatch): Promise<void>;
}

// A failed removal or acknowledgement leaves a leased job for a later retry.
export function createRecipeImageCleanupHandler(deps: RecipeCleanupDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (!deps.authorized(request)) return new Response("Unauthorized", { status: 401 });
    try {
      const batch = await deps.claim();
      if (batch.paths.length) {
        await deps.remove(batch.paths);
        await deps.complete(batch);
      }
      return Response.json({ removed: batch.paths.length });
    } catch {
      // Never emit account IDs, object paths or credentials in failure logs.
      return Response.json({ message: "Cleanup failed; retry after the lease expires." }, { status: 503 });
    }
  };
}
