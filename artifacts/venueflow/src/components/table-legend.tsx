import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

export type LegendTable = {
  id: string;
  label: string;
  price: number | null;
  purchaserName: string | null;
};

interface Props {
  venueId: string;
  scope: "restaurant" | "nightlife";
  tables: LegendTable[];
  isAdmin: boolean;
}

function labelSortKey(label: string): [number, string] {
  // Numeric portion sorts first; non-numeric labels sort to the end alphabetically.
  const m = label.match(/\d+/);
  return m ? [parseInt(m[0], 10), label] : [Number.POSITIVE_INFINITY, label];
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

async function putTable(id: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/tables/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(json.message ?? `Save failed (${res.status})`);
  }
}

export function TableLegend({ venueId, scope, tables, isAdmin }: Props) {
  const sorted = useMemo(() => {
    return [...tables].sort((a, b) => {
      const [an, as] = labelSortKey(a.label);
      const [bn, bs] = labelSortKey(b.label);
      if (an !== bn) return an - bn;
      return as.localeCompare(bs);
    });
  }, [tables]);

  const totals = useMemo(() => {
    let sold = 0;
    let revenue = 0;
    for (const t of tables) {
      if (t.price != null && t.price > 0) {
        sold += 1;
        revenue += t.price;
      }
    }
    return { sold, revenue, total: tables.length };
  }, [tables]);

  return (
    <aside className="border rounded-xl bg-card flex flex-col" style={{ minWidth: 280 }}>
      <div className="px-4 py-3 border-b">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Table Sales</div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <div className="text-lg font-semibold">{fmtUsd(totals.revenue)}</div>
          <div className="text-xs text-muted-foreground">
            {totals.sold} / {totals.total} sold
          </div>
        </div>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 640 }}>
        {sorted.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">
            No tables yet — add some on the floor plan first.
          </div>
        ) : (
          <ul className="divide-y">
            {sorted.map((t) => (
              <LegendRow key={t.id} venueId={venueId} scope={scope} table={t} editable={isAdmin} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function LegendRow({
  venueId, scope, table, editable,
}: { venueId: string; scope: "restaurant" | "nightlife"; table: LegendTable; editable: boolean }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState<"price" | "name" | "label" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track the last saved value so we can skip PUTs when the field hasn't
  // actually changed (an onBlur fires whether or not the user typed).
  const lastPriceRef = useRef<string>(table.price != null ? String(table.price) : "");
  const lastNameRef  = useRef<string>(table.purchaserName ?? "");
  const lastLabelRef = useRef<string>(table.label);

  const save = async (field: "price" | "name" | "label", raw: string) => {
    const trimmed = raw.trim();
    const ref = field === "price" ? lastPriceRef : field === "name" ? lastNameRef : lastLabelRef;
    if (trimmed === ref.current) return;
    if (field === "label" && trimmed === "") {
      // Don't allow blanking the label — silently revert.
      return;
    }

    setSaving(field);
    setError(null);
    try {
      const body =
        field === "price"
          ? { price: trimmed === "" ? null : Number(trimmed.replace(/[$,]/g, "")) }
          : field === "name"
            ? { purchaserName: trimmed === "" ? null : trimmed }
            : { label: trimmed };
      await putTable(table.id, body);
      ref.current = trimmed;
      // Match the manager floor plan's scope-aware query key so the
      // table list refreshes for whichever scope this row belongs to.
      await qc.invalidateQueries({ queryKey: ["/tables", venueId, scope] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  return (
    <li className="px-4 py-2.5 flex items-center gap-2 text-sm">
      <input
        type="text"
        defaultValue={table.label}
        readOnly={!editable}
        onBlur={(e) => editable && void save("label", e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="font-mono font-semibold w-14 flex-shrink-0 px-1.5 py-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        aria-label={`Label for ${table.label}`}
      />
      <input
        type="text"
        inputMode="decimal"
        defaultValue={table.price != null ? String(table.price) : ""}
        placeholder="$"
        readOnly={!editable}
        onBlur={(e) => editable && void save("price", e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-20 px-2 py-1 rounded border border-input bg-background text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        aria-label={`Price for ${table.label}`}
      />
      <input
        type="text"
        defaultValue={table.purchaserName ?? ""}
        placeholder="Purchaser"
        readOnly={!editable}
        onBlur={(e) => editable && void save("name", e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="flex-1 min-w-0 px-2 py-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        aria-label={`Purchaser for ${table.label}`}
      />
      <span className="w-3.5 flex-shrink-0">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : null}
      </span>
      {error ? (
        <span className="text-[10px] text-destructive ml-1" title={error}>!</span>
      ) : null}
    </li>
  );
}
