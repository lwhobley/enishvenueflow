import { useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { parseCsv, normalizeHeader } from "@/lib/csv";

export interface CsvField {
  key: string;
  label: string;
  /** Alternate header names to accept. Compared case/whitespace/punct-insensitive. */
  aliases?: string[];
  required?: boolean;
  /** Converts the raw cell string into the value sent to the API. Default: trim. */
  transform?: (raw: string) => unknown;
  /** Validates the parsed value. Return an error string to flag the row, or null. */
  validate?: (value: unknown, row: Record<string, unknown>) => string | null;
}

export interface CsvImportConfig {
  /** Columns the importer recognizes. Order is the preview-table column order. */
  fields: CsvField[];
  /** Optional whole-row validator after per-field transforms. */
  validateRow?: (row: Record<string, unknown>) => string | null;
}

export interface ImportResult {
  inserted?: number;
  skipped?: number;
  total?: number;
  errors?: Array<{ row: number; reason: string }>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  config: CsvImportConfig;
  /** Sample CSV header line to show in the empty state. */
  sampleHeaders?: string;
  /** Called with the validated rows. Should hit the bulk endpoint and return counts. */
  onSubmit: (rows: Array<Record<string, unknown>>) => Promise<ImportResult>;
}

interface ParsedRow {
  raw: string[];
  values: Record<string, unknown>;
  error: string | null;
}

const PREVIEW_LIMIT = 8;

export function CsvImportDialog({
  open, onOpenChange, title, description, config, sampleHeaders, onSubmit,
}: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const fieldByNormHeader = useMemo(() => {
    const map = new Map<string, CsvField>();
    for (const f of config.fields) {
      map.set(normalizeHeader(f.key), f);
      map.set(normalizeHeader(f.label), f);
      for (const a of f.aliases ?? []) map.set(normalizeHeader(a), f);
    }
    return map;
  }, [config]);

  const handleFile = async (file: File) => {
    setParseError(null);
    setResult(null);
    setFilename(file.name);
    try {
      const text = await file.text();
      const { headers: rawHeaders, rows } = parseCsv(text);
      if (rawHeaders.length === 0) {
        setParseError("No header row found.");
        setHeaders([]); setParsedRows([]);
        return;
      }

      // Resolve each header to a known field key (or null when unmapped).
      const colKeys: (string | null)[] = rawHeaders.map((h) => fieldByNormHeader.get(normalizeHeader(h))?.key ?? null);

      const required = config.fields.filter((f) => f.required).map((f) => f.key);
      const presentKeys = new Set(colKeys.filter((k): k is string => k !== null));
      const missingRequired = required.filter((k) => !presentKeys.has(k));
      if (missingRequired.length > 0) {
        const labels = missingRequired
          .map((k) => config.fields.find((f) => f.key === k)?.label ?? k)
          .join(", ");
        setParseError(`Missing required column${missingRequired.length === 1 ? "" : "s"}: ${labels}`);
        setHeaders(rawHeaders);
        setParsedRows([]);
        return;
      }

      const parsed: ParsedRow[] = rows.map((r) => {
        const values: Record<string, unknown> = {};
        for (let i = 0; i < colKeys.length; i++) {
          const key = colKeys[i];
          if (!key) continue;
          const field = config.fields.find((f) => f.key === key)!;
          const cell = (r[i] ?? "").trim();
          values[key] = field.transform ? field.transform(cell) : cell;
        }
        // Validate per-field, then whole row.
        let error: string | null = null;
        for (const f of config.fields) {
          if (f.required && (values[f.key] === undefined || values[f.key] === "" || values[f.key] === null)) {
            error = `Missing ${f.label}`;
            break;
          }
          if (f.validate) {
            const e = f.validate(values[f.key], values);
            if (e) { error = e; break; }
          }
        }
        if (!error && config.validateRow) error = config.validateRow(values);
        return { raw: r, values, error };
      });

      setHeaders(rawHeaders);
      setParsedRows(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to read file");
    }
  };

  const handleSubmit = async () => {
    const valid = parsedRows.filter((r) => !r.error).map((r) => r.values);
    if (valid.length === 0) {
      toast({ title: "Nothing valid to import", description: "Fix the flagged rows or pick a different file.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await onSubmit(valid);
      setResult(res);
      toast({
        title: `Imported ${res.inserted ?? valid.length} row${(res.inserted ?? valid.length) === 1 ? "" : "s"}`,
        description: [
          res.skipped ? `${res.skipped} skipped (duplicate)` : null,
          res.errors?.length ? `${res.errors.length} server-side error${res.errors.length === 1 ? "" : "s"}` : null,
        ].filter(Boolean).join(" · ") || undefined,
      });
    } catch (err) {
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setFilename(null);
    setHeaders([]);
    setParsedRows([]);
    setParseError(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const validCount = parsedRows.filter((r) => !r.error).length;
  const invalidCount = parsedRows.length - validCount;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { if (!v) reset(); onOpenChange(v); } }}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={submitting}>
              <Upload className="w-4 h-4 mr-2" /> Choose CSV file
            </Button>
            {filename ? (
              <span className="text-sm text-muted-foreground truncate">{filename}</span>
            ) : (
              <span className="text-sm text-muted-foreground">No file selected</span>
            )}
            {filename && !submitting ? (
              <Button variant="ghost" size="sm" onClick={reset} className="ml-auto">Reset</Button>
            ) : null}
          </div>

          <div className="text-xs text-muted-foreground rounded-md border bg-muted/40 px-3 py-2 space-y-1">
            <div>
              <span className="font-medium text-foreground">Recognized columns:</span>{" "}
              {config.fields.map((f) => `${f.label}${f.required ? "*" : ""}`).join(", ")}
            </div>
            {sampleHeaders ? (
              <div className="font-mono text-[11px]">
                <span className="text-muted-foreground">Example header row: </span>
                <span className="text-foreground">{sampleHeaders}</span>
              </div>
            ) : null}
            <div>Required columns are starred. Other recognized header names work too — case + spaces + dashes don't matter.</div>
          </div>

          {parseError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{parseError}</span>
            </div>
          ) : null}

          {parsedRows.length > 0 ? (
            <>
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3 h-3" /> {validCount} valid
                </span>
                {invalidCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-100 text-red-800">
                    <AlertTriangle className="w-3 h-3" /> {invalidCount} flagged
                  </span>
                ) : null}
                <span className="text-muted-foreground ml-auto">
                  Showing first {Math.min(parsedRows.length, PREVIEW_LIMIT)} of {parsedRows.length}
                </span>
              </div>

              <div className="border rounded-md overflow-x-auto max-h-72">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">#</th>
                      {config.fields.map((f) => (
                        <th key={f.key} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                          {f.label}{f.required ? "*" : ""}
                        </th>
                      ))}
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsedRows.slice(0, PREVIEW_LIMIT).map((r, i) => (
                      <tr key={i} className={r.error ? "bg-red-50" : ""}>
                        <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                        {config.fields.map((f) => {
                          const v = r.values[f.key];
                          const display = Array.isArray(v) ? v.join(", ") : v == null || v === "" ? "—" : String(v);
                          return (
                            <td key={f.key} className="px-2 py-1 max-w-[220px] truncate" title={display}>
                              {display}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1 text-muted-foreground">
                          {r.error ? <span className="text-destructive">{r.error}</span> : <span className="text-emerald-700">OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {result ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <div className="font-medium text-foreground">Import complete</div>
              <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                <li>Inserted: {result.inserted ?? 0}</li>
                {result.skipped !== undefined ? <li>Skipped duplicates: {result.skipped}</li> : null}
                {result.errors && result.errors.length > 0 ? (
                  <li className="text-destructive">
                    Server flagged {result.errors.length} row{result.errors.length === 1 ? "" : "s"}: {result.errors.slice(0, 3).map((e) => `#${e.row} (${e.reason})`).join(", ")}{result.errors.length > 3 ? "…" : ""}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Close</Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || validCount === 0}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing…</>
            ) : (
              <>Import {validCount > 0 ? validCount : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
