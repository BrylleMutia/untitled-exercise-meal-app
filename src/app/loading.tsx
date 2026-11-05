import { LoadingIndicator } from "@/components/ui/LoadingIndicator";

export default function Loading() {
  return <div className="grid min-h-[60vh] place-items-center"><LoadingIndicator label="Loading your day…" /></div>;
}
