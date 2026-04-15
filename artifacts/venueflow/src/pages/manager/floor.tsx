import { useState, useRef, useCallback, useEffect } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import {
  useListFloorSections,
  getListFloorSectionsQueryKey,
  useListTables,
  getListTablesQueryKey,
  useUpdateTable,
  useCreateTable,
  useDeleteTable,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Square, Armchair } from "lucide-react";
import floorPlanBg from "@assets/IMG_2248_1776293611211.png";

type ChairRecord = { id: string; venueId: string; x: number; y: number };
type DragTarget  = { type: "table" | "chair"; id: string };
type TableShape  = "square" | "crescent";

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const CW = 1294;
const CH = 832;

// ── Table shape renderers ────────────────────────────────────────────────────
function SquareTableShape({ w, h, selected }: { w: number; h: number; selected: boolean }) {
  return (
    <div
      style={{
        width: w, height: h,
        backgroundColor: "rgba(255,255,255,0.88)",
        border: `${selected ? 3 : 2}px solid ${selected ? "#fff" : "#1f2937"}`,
        borderRadius: 6,
        boxShadow: selected
          ? "0 0 0 3px #3b82f6, 0 4px 14px rgba(0,0,0,0.5)"
          : "0 3px 10px rgba(0,0,0,0.45)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}
    />
  );
}

function CrescentTableShape({ w, h, selected }: { w: number; h: number; selected: boolean }) {
  // Half-circle — flat edge at bottom, curved edge at top
  const r = w / 2;
  return (
    <div
      style={{
        width: w, height: r,          // height = radius → perfect half-circle
        backgroundColor: "rgba(255,255,255,0.88)",
        border: `${selected ? 3 : 2}px solid ${selected ? "#fff" : "#1f2937"}`,
        borderRadius: `${r}px ${r}px 0 0`,
        borderBottom: "none",
        boxShadow: selected
          ? "0 0 0 3px #3b82f6, 0 4px 14px rgba(0,0,0,0.5)"
          : "0 3px 10px rgba(0,0,0,0.45)",
      }}
    />
  );
}

// ── U-shaped chair (small crescent) ─────────────────────────────────────────
function ChairShape({ selected }: { selected: boolean }) {
  return (
    <div
      style={{
        width: 18, height: 11,
        backgroundColor: "#1f2937",
        borderRadius: "9px 9px 0 0",
        border: selected ? "2px solid #3b82f6" : "1.5px solid #374151",
        boxShadow: "0 2px 5px rgba(0,0,0,0.55)",
      }}
    />
  );
}

export default function ManagerFloor() {
  const { activeVenue } = useAppContext();
  const queryClient    = useQueryClient();

  const [chairs, setChairs]             = useState<ChairRecord[]>([]);
  const [selected, setSelected]         = useState<DragTarget | null>(null);
  const [addMode, setAddMode]           = useState<"square" | "crescent" | "chair" | null>(null);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [tableOv, setTableOv]           = useState<Record<string, { x: number; y: number }>>({});
  const [scale, setScale]               = useState(1);

  const scaleRef     = useRef(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLDivElement>(null);
  const dragRef      = useRef<{ target: DragTarget; sx: number; sy: number; ox: number; oy: number } | null>(null);

  // Resize-aware scale so canvas always fills the box
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const s = Math.min(1, el.clientWidth / CW);
      setScale(s); scaleRef.current = s;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { data: sections } = useListFloorSections(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListFloorSectionsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );
  const { data: tables } = useListTables(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListTablesQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  const updateTable    = useUpdateTable();
  const createTableMut = useCreateTable();
  const deleteTableMut = useDeleteTable();
  const tablesQK       = getListTablesQueryKey({ venueId: activeVenue?.id || "" });
  const sectionsQK     = getListFloorSectionsQueryKey({ venueId: activeVenue?.id || "" });

  useEffect(() => {
    if (!activeVenue?.id) return;
    apiFetch(`/chairs?venueId=${activeVenue.id}`)
      .then(d => setChairs(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [activeVenue?.id]);

  // Ensure at least one section exists
  const ensureSection = useCallback(async (): Promise<string | null> => {
    if (sections?.[0]) return sections[0].id;
    if (!activeVenue?.id) return null;
    const s = await apiFetch("/floor-sections", {
      method: "POST",
      body: JSON.stringify({ venueId: activeVenue.id, name: "Main Floor", capacity: 0 }),
    });
    queryClient.invalidateQueries({ queryKey: sectionsQK });
    return s.id;
  }, [sections, activeVenue?.id, queryClient, sectionsQK]);

  // Canvas coordinates corrected for CSS scale
  const canvasPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scaleRef.current,
      y: (e.clientY - rect.top)  / scaleRef.current,
    };
  };

  const handleCanvasClick = useCallback(async (e: React.MouseEvent) => {
    if (!addMode || !activeVenue?.id) return;
    const el = e.target as HTMLElement;
    if (el !== canvasRef.current && !el.classList.contains("floor-bg")) return;
    const { x, y } = canvasPos(e);

    if (addMode === "chair") {
      const chair = await apiFetch("/chairs", {
        method: "POST",
        body: JSON.stringify({ venueId: activeVenue.id, x, y }),
      });
      setChairs(prev => [...prev, chair]);
    } else {
      const sectionId = await ensureSection();
      if (!sectionId) return;
      const isCresc = addMode === "crescent";
      const w = isCresc ? 90 : 80;
      const h = isCresc ? 45 : 80;
      await createTableMut.mutateAsync({ data: {
        venueId: activeVenue.id, sectionId,
        label: `T${(tables?.length ?? 0) + 1}`,
        capacity: isCresc ? 6 : 4,
        x: String(x), y: String(y),
        width: String(w), height: String(h),
        shape: addMode,
      }});
      queryClient.invalidateQueries({ queryKey: tablesQK });
    }
    setAddMode(null);
  }, [addMode, activeVenue?.id, ensureSection, createTableMut, tables?.length, queryClient, tablesQK]);

  // Keep latest drag-save data in refs so window listeners can access them
  const chairsRef   = useRef<ChairRecord[]>([]);
  const tableOvRef  = useRef<Record<string, { x: number; y: number }>>({});
  useEffect(() => { chairsRef.current = chairs; }, [chairs]);
  useEffect(() => { tableOvRef.current = tableOv; }, [tableOv]);

  const startDrag = useCallback((clientX: number, clientY: number, target: DragTarget, ox: number, oy: number) => {
    setSelected(target);
    dragRef.current = { target, sx: clientX, sy: clientY, ox, oy };

    const applyMove = (cx: number, cy: number) => {
      if (!dragRef.current) return;
      const s = scaleRef.current;
      const dx = (cx - dragRef.current.sx) / s;
      const dy = (cy - dragRef.current.sy) / s;
      const nx = Math.max(0, Math.min(CW - 10, dragRef.current.ox + dx));
      const ny = Math.max(0, Math.min(CH - 10, dragRef.current.oy + dy));
      if (dragRef.current.target.type === "chair") {
        setChairs(prev => prev.map(c => c.id === dragRef.current!.target.id ? { ...c, x: nx, y: ny } : c));
      } else {
        setTableOv(prev => ({ ...prev, [dragRef.current!.target.id]: { x: nx, y: ny } }));
      }
    };

    const finishDrag = async () => {
      cleanup();
      if (!dragRef.current) return;
      const { target: t } = dragRef.current;
      dragRef.current = null;
      if (t.type === "chair") {
        const ch = chairsRef.current.find(c => c.id === t.id);
        if (ch) await apiFetch(`/chairs/${t.id}`, { method: "PUT", body: JSON.stringify({ x: ch.x, y: ch.y }) });
      } else {
        const ov = tableOvRef.current[t.id];
        if (ov) {
          await updateTable.mutateAsync({ id: t.id, data: { x: ov.x, y: ov.y } });
          queryClient.invalidateQueries({ queryKey: tablesQK });
        }
      }
    };

    const onMouseMove = (ev: MouseEvent) => applyMove(ev.clientX, ev.clientY);
    const onMouseUp   = () => finishDrag();
    const onTouchMove = (ev: TouchEvent) => { ev.preventDefault(); applyMove(ev.touches[0].clientX, ev.touches[0].clientY); };
    const onTouchEnd  = () => finishDrag();

    const cleanup = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend",  onTouchEnd);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend",  onTouchEnd);
  }, [updateTable, queryClient, tablesQK]);

  const handleMouseDown = useCallback((e: React.MouseEvent, target: DragTarget, ox: number, oy: number) => {
    e.stopPropagation(); e.preventDefault();
    startDrag(e.clientX, e.clientY, target, ox, oy);
  }, [startDrag]);

  const handleTouchStart = useCallback((e: React.TouchEvent, target: DragTarget, ox: number, oy: number) => {
    e.stopPropagation(); e.preventDefault();
    startDrag(e.touches[0].clientX, e.touches[0].clientY, target, ox, oy);
  }, [startDrag]);

  const handleRemove = useCallback(async () => {
    if (!selected) return;
    if (selected.type === "table") {
      await deleteTableMut.mutateAsync({ id: selected.id });
      queryClient.invalidateQueries({ queryKey: tablesQK });
      setTableOv(p => { const n = { ...p }; delete n[selected.id]; return n; });
    } else {
      await apiFetch(`/chairs/${selected.id}`, { method: "DELETE" });
      setChairs(p => p.filter(c => c.id !== selected.id));
    }
    setSelected(null);
  }, [selected, deleteTableMut, queryClient, tablesQK]);

  const saveLabel = useCallback(async () => {
    if (!editingId || !editingLabel.trim()) { setEditingId(null); return; }
    await updateTable.mutateAsync({ id: editingId, data: { label: editingLabel.trim() } });
    queryClient.invalidateQueries({ queryKey: tablesQK });
    setEditingId(null);
  }, [editingId, editingLabel, updateTable, queryClient, tablesQK]);

  return (
    <div className="space-y-3">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Floor Plan</h1>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={addMode === "square" ? "default" : "outline"}
            onClick={() => setAddMode(addMode === "square" ? null : "square")}
          >
            <Square className="w-4 h-4 mr-2" /> Add Square Table
          </Button>
          <Button
            variant={addMode === "crescent" ? "default" : "outline"}
            onClick={() => setAddMode(addMode === "crescent" ? null : "crescent")}
          >
            {/* crescent icon using a styled char */}
            <span className="mr-2 text-base leading-none">☽</span> Add Crescent Table
          </Button>
          <Button
            variant={addMode === "chair" ? "default" : "outline"}
            onClick={() => setAddMode(addMode === "chair" ? null : "chair")}
          >
            <Armchair className="w-4 h-4 mr-2" /> Add Chair
          </Button>
          <Button variant="destructive" disabled={!selected} onClick={handleRemove}>
            <Trash2 className="w-4 h-4 mr-2" /> Remove
          </Button>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-4 rounded border border-gray-700 bg-white/80" /> Square table
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-2.5 bg-white/80 border border-gray-700" style={{ borderRadius: "10px 10px 0 0", borderBottom: "none" }} /> Crescent table
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-2.5 bg-gray-800" style={{ borderRadius: "8px 8px 0 0" }} /> Chair
        </span>
        {addMode && (
          <span className="ml-auto bg-muted px-2 py-0.5 rounded-full">
            Click floor to place {addMode === "square" ? "square table" : addMode === "crescent" ? "crescent table" : "chair"} · Esc to cancel
          </span>
        )}
        {selected && !addMode && (
          <span className="ml-auto">
            {selected.type === "table" ? "Double-click to rename" : "Chair selected"} · Remove to delete
          </span>
        )}
      </div>

      {/* ── Outer container ── */}
      <div
        ref={containerRef}
        className={`w-full overflow-hidden border rounded-xl relative bg-neutral-200 ${addMode ? "cursor-crosshair" : ""}`}
        style={{ height: CH * scale }}
        onClick={handleCanvasClick}
        onKeyDown={e => { if (e.key === "Escape") setAddMode(null); }}
        tabIndex={0}
      >
        {/* ── Inner canvas scaled to fit ── */}
        <div
          ref={canvasRef}
          className="absolute top-0 left-0 select-none"
          style={{ width: CW, height: CH, transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          {/* Floor plan image — full opacity */}
          <img
            src={floorPlanBg}
            alt="Venue floor plan"
            className="floor-bg absolute inset-0 pointer-events-none"
            style={{ width: CW, height: CH }}
            draggable={false}
          />

          {/* ── Tables ── */}
          {tables?.map(table => {
            const ov   = tableOv[table.id];
            const x    = ov?.x ?? Number(table.x);
            const y    = ov?.y ?? Number(table.y);
            const w    = Number(table.width);
            const h    = Number(table.height);
            const sel  = selected?.type === "table" && selected.id === table.id;
            const shape = (table as any).shape as TableShape ?? "square";

            return (
              <div
                key={table.id}
                className="absolute cursor-grab active:cursor-grabbing"
                style={{ left: x, top: y, width: w, height: shape === "crescent" ? w / 2 : h, userSelect: "none" }}
                onMouseDown={e => handleMouseDown(e, { type: "table", id: table.id }, x, y)}
                onTouchStart={e => handleTouchStart(e, { type: "table", id: table.id }, x, y)}
                onDoubleClick={e => { e.stopPropagation(); setEditingId(table.id); setEditingLabel(table.label); }}
              >
                {shape === "crescent"
                  ? <CrescentTableShape w={w} h={h} selected={sel} />
                  : <SquareTableShape   w={w} h={h} selected={sel} />}

                {/* Label overlay */}
                {editingId === table.id ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Input
                      autoFocus
                      className="w-[80%] text-center text-xs font-bold bg-white/80 border-gray-400 h-6 px-1"
                      value={editingLabel}
                      onChange={e => setEditingLabel(e.target.value)}
                      onBlur={saveLabel}
                      onKeyDown={e => {
                        if (e.key === "Enter") saveLabel();
                        if (e.key === "Escape") setEditingId(null);
                        e.stopPropagation();
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-gray-900 font-bold text-[11px] leading-tight drop-shadow-sm">{table.label}</span>
                    <span className="text-gray-600 text-[9px]">{table.capacity}p</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Chairs ── */}
          {chairs.map(chair => {
            const sel = selected?.type === "chair" && selected.id === chair.id;
            return (
              <div
                key={chair.id}
                className="absolute cursor-grab active:cursor-grabbing"
                style={{ left: Number(chair.x) - 9, top: Number(chair.y) - 6, userSelect: "none" }}
                onMouseDown={e => handleMouseDown(e, { type: "chair", id: chair.id }, Number(chair.x), Number(chair.y))}
                onTouchStart={e => handleTouchStart(e, { type: "chair", id: chair.id }, Number(chair.x), Number(chair.y))}
              >
                <ChairShape selected={sel} />
              </div>
            );
          })}

          {/* ── Empty state ── */}
          {!tables?.length && !chairs.length && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
              <div className="bg-black/40 text-white text-sm px-4 py-2 rounded-lg backdrop-blur-sm">
                Use the toolbar to add tables and chairs
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
