import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Check, Info, RefreshCcw } from "lucide-react";
import { bookingFetch, useBooking, DEFAULT_VENUE_ID } from "@/contexts/booking-context";
import floorPlanBg from "@assets/IMG_2248_1776293611211.png";

// Same canvas dims as the manager floor (artifacts/venueflow/src/pages/manager/floor.tsx)
// — kept identical so a table positioned at (x, y) by the manager paints
// in the exact same pixel-spot here.
const CW = 1294;
const CH = 832;

interface PublicSection { id: string; name: string; color: string; capacity: number; }
interface PublicTable {
  id: string; sectionId: string; label: string; capacity: number;
  x: number; y: number; width: number; height: number;
  shape: string; rotation: number;
  price: number | null; booked: boolean;
}
interface FloorPlanResponse { sections: PublicSection[]; tables: PublicTable[]; }

export default function BookFloorPicker() {
  const [, navigate] = useLocation();
  const { draft, setDraft } = useBooking();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const date = draft.date || today;

  const [data, setData] = useState<FloorPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resize-aware scale (same logic as the manager floor plan).
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.35);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      setScale(Math.min(1, w / CW));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadFloor = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bookingFetch<FloorPlanResponse>(
        `/api/public/floor-plan?venueId=${DEFAULT_VENUE_ID}&date=${date}`,
      );
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the floor plan");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void loadFloor(); }, [loadFloor]);

  // 5-second polling matches the manager floor plan refresh — so a table
  // booked in another browser blanks out here within seconds.
  useEffect(() => {
    const t = setInterval(() => { void loadFloor(); }, 5000);
    return () => clearInterval(t);
  }, [loadFloor]);

  const sectionMap = useMemo(() => {
    const m = new Map<string, PublicSection>();
    for (const s of data?.sections ?? []) m.set(s.id, s);
    return m;
  }, [data?.sections]);

  const handlePick = (t: PublicTable) => {
    if (t.booked) return;
    if (t.capacity < draft.partySize) return; // soft block
    const section = sectionMap.get(t.sectionId);
    setDraft({
      tableId: t.id,
      tableLabel: t.label,
      sectionId: t.sectionId,
      sectionName: section?.name ?? null,
      tablePrice: t.price ?? null,
      // Default deposit: $100 per guest for nightlife open bookings,
      // table minimum if set, otherwise $0. Actual final figure set on
      // checkout once we've fetched the event's depositPerGuest.
      depositAmount: t.price ?? 0,
    });
  };

  const selectedTable = useMemo(
    () => data?.tables.find((t) => t.id === draft.tableId) ?? null,
    [data?.tables, draft.tableId],
  );

  const handleContinue = () => {
    if (!draft.tableId) return;
    navigate("/book/checkout");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Pick your section</h1>
          <p className="mt-1 text-sm text-white/60">
            Tap a table on the floor plan. Greyed-out tables are already booked for {fmtDate(date)}.
            {draft.eventTitle ? <> · For <span className="text-[#F5C56B]">{draft.eventTitle}</span></> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDraft({ date: e.target.value, tableId: null, tableLabel: null })}
            className="h-10 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white outline-none focus:border-[#F5C56B]/60"
          />
          <select
            value={draft.partySize}
            onChange={(e) => setDraft({ partySize: Number(e.target.value) })}
            className="h-10 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white outline-none focus:border-[#F5C56B]/60"
          >
            {Array.from({ length: 19 }).map((_, i) => {
              const n = i + 2;
              return <option key={n} value={n} className="bg-[#0B0E1A]">{n} guests</option>;
            })}
            <option value={25} className="bg-[#0B0E1A]">25+ guests</option>
          </select>
          <button
            type="button"
            onClick={() => void loadFloor()}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white/85 hover:bg-white/10"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Section legend */}
      {data?.sections.length ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/65">
          {data.sections.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-white/40 bg-white/15" /> Available</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-[#F5C56B] bg-[#F5C56B]" /> Selected</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-white/20 bg-white/5" /> Booked</span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Canvas */}
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-neutral-900"
          style={{ height: Math.max(CH * scale, 280) }}
        >
          <div
            className="absolute top-0 left-0 select-none"
            style={{ width: CW, height: CH, transform: `scale(${scale})`, transformOrigin: "top left" }}
          >
            <img
              src={floorPlanBg}
              alt="Enish nightlife floor plan"
              className="absolute inset-0 pointer-events-none opacity-90"
              style={{ width: CW, height: CH }}
              draggable={false}
            />
            {data?.tables.map((t) => {
              const isSel = draft.tableId === t.id;
              const isBooked = t.booked;
              const tooSmall = t.capacity < draft.partySize;
              const sectionColor = sectionMap.get(t.sectionId)?.color ?? "#F5C56B";
              const fill = isBooked
                ? "rgba(40,40,50,0.85)"
                : isSel
                  ? "rgba(245,197,107,0.95)"
                  : tooSmall
                    ? "rgba(255,255,255,0.40)"
                    : "rgba(255,255,255,0.92)";
              const border = isSel ? "#F5C56B" : isBooked ? "#33384a" : "#1f2937";
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handlePick(t)}
                  disabled={isBooked || tooSmall}
                  title={
                    isBooked ? `${t.label} — booked`
                      : tooSmall ? `${t.label} — fits ${t.capacity}, party of ${draft.partySize}`
                        : `${t.label} — seats ${t.capacity}${t.price ? ` · $${t.price.toFixed(0)} min` : ""}`
                  }
                  className="absolute"
                  style={{
                    left: t.x, top: t.y, width: t.width, height: t.height,
                    background: fill,
                    border: `${isSel ? 3 : 2}px solid ${border}`,
                    borderRadius: t.shape === "crescent" ? "20px 20px 6px 6px" : 6,
                    transform: `rotate(${t.rotation}deg)`,
                    transformOrigin: "center center",
                    cursor: isBooked || tooSmall ? "not-allowed" : "pointer",
                    boxShadow: isSel ? "0 0 0 4px rgba(245,197,107,0.3)" : "0 3px 8px rgba(0,0,0,0.5)",
                    padding: 0,
                  }}
                >
                  <span
                    className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                    style={{ transform: `rotate(${-t.rotation}deg)` }}
                  >
                    <span className="text-[11px] font-bold text-gray-900 leading-tight">{t.label}</span>
                    <span className="text-[9px] text-gray-700">{t.capacity}p</span>
                  </span>
                  <span
                    aria-hidden
                    className="absolute left-0 right-0 top-0 h-1"
                    style={{ background: sectionColor, opacity: isBooked ? 0.4 : 1 }}
                  />
                </button>
              );
            })}
          </div>
          {loading && !data ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white/70">
              Loading floor plan…
            </div>
          ) : null}
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </div>

        {/* Selection summary */}
        <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-xs uppercase tracking-wider text-white/45">Your selection</div>
          {selectedTable ? (
            <>
              <div className="mt-2 text-2xl font-semibold">{selectedTable.label}</div>
              <div className="text-sm text-white/65">
                {sectionMap.get(selectedTable.sectionId)?.name ?? "—"}
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <Row k="Date" v={fmtDate(date)} />
                <Row k="Arrival" v={draft.time || "—"} />
                <Row k="Party" v={`${draft.partySize} guests`} />
                <Row k="Capacity" v={`Seats up to ${selectedTable.capacity}`} />
                {selectedTable.price ? <Row k="Table minimum" v={`$${selectedTable.price.toFixed(0)}`} /> : null}
                {draft.eventTitle ? <Row k="Event" v={draft.eventTitle} /> : null}
              </dl>
              {selectedTable.capacity < draft.partySize ? (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
                  <Info className="h-3.5 w-3.5 mt-[2px]" />
                  This table only seats {selectedTable.capacity}. Pick a larger one for {draft.partySize} guests.
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleContinue}
                disabled={!draft.tableId || selectedTable.capacity < draft.partySize}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#F5C56B] px-4 py-2.5 text-sm font-semibold text-[#0B0E1A] hover:bg-[#FFD27A] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to checkout <ArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <div className="mt-2 text-sm text-white/55">
              Tap any open table on the floor plan to pick it.
            </div>
          )}
          <div className="mt-6 border-t border-white/10 pt-4 text-xs text-white/55">
            <div className="mb-2 inline-flex items-center gap-1.5 text-[#F5C56B]">
              <Check className="h-3.5 w-3.5" /> Live availability
            </div>
            Bookings sync to the host stand the moment you confirm — your section is locked in
            within seconds of payment.
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-white/55">{k}</dt>
      <dd className="text-white">{v}</dd>
    </div>
  );
}

function fmtDate(yyyyMMdd: string): string {
  const [y, m, d] = yyyyMMdd.split("-").map((s) => Number(s));
  if (!y || !m || !d) return yyyyMMdd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}
