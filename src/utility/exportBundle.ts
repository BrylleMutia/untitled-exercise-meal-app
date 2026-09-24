import { strToU8, zipSync } from "fflate";
import type { AccountExport, AccountExportRow, AccountExportValue } from "@/types/backend";

type ExportRow = AccountExportRow;

function printable(value: AccountExportValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function escapeCsv(value: AccountExportValue | undefined): string {
  const text = printable(value);
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

export function toCsv(rows: ExportRow[]): string {
  const headers = rows.reduce<string[]>((all, row) => {
    for (const key of Object.keys(row)) if (!all.includes(key)) all.push(key);
    return all;
  }, []);
  if (headers.length === 0) return "";
  return [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
  ].join("\r\n") + "\r\n";
}

function entityRows(value: AccountExportValue): ExportRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is ExportRow => Boolean(row && typeof row === "object" && !Array.isArray(row)));
}

export function buildAccountExportZip(data: AccountExport, exportedAt: string): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "export.json": strToU8(JSON.stringify(data, null, 2) + "\n"),
  };
  const metadata = Object.entries(data)
    .filter(([, value]) => !Array.isArray(value))
    .map(([key, value]) => ({ key, value }));
  files["metadata.csv"] = strToU8(toCsv(metadata));

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) files[`${key}.csv`] = strToU8(toCsv(entityRows(value)));
  }

  const manifest = {
    schemaVersion: 1,
    exportedAt,
    format: "calicoach-account-export",
    files: Object.keys(files).sort().concat("manifest.json").sort(),
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2) + "\n");
  return zipSync(files, { level: 6, mtime: new Date("1980-01-01T00:00:00.000Z") });
}
