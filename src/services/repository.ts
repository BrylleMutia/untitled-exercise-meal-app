import type { AppSnapshot } from "@/types/domain";

/**
 * Repository boundary. The demo build ships a localStorage implementation;
 * the production path swaps this for the authenticated Supabase repository
 * (RPCs / Edge Functions) without changing Context actions or routes.
 */
export interface SnapshotRepository {
  load(): AppSnapshot | null;
  save(snapshot: AppSnapshot): boolean;
  clear(): boolean;
}
