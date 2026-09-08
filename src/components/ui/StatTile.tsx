import type { CardTone } from "./Card";
import { Card } from "./Card";

interface StatTileProps {
  tone?: CardTone;
  label: string;
  value: string;
  sub?: string;
}

export function StatTile({ tone = "white", label, value, sub }: StatTileProps) {
  return (
    <Card tone={tone} className="p-4">
      <p className="text-xs font-bold text-ink-soft">{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] font-semibold text-muted">{sub}</p> : null}
    </Card>
  );
}
