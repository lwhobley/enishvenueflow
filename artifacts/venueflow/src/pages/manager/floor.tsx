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
import { Plus, Trash2, SquarePlus, LayoutTemplate, Loader2 } from "lucide-react";
import floorPlanBg from "@assets/IMG_2196_1776230923456.png";

type ChairRecord = { id: string; venueId: string; x: number; y: number };
type DragTarget = { type: "table" | "chair"; id: string };

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const CANVAS_W = 1294;
const CANVAS_H = 832;

const ring = (cx: number, cy: number, r: number, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i * Math.PI * 2) / n - Math.PI / 2;
    return { x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) };
  });

const edges = (x: number, y: number, w: number, h: number) => [
  { x: Math.round(x + w / 2), y: y - 23 },
  { x: Math.round(x + w / 2), y: y + h + 23 },
  { x: x - 23, y: Math.round(y + h / 2) },
  { x: x + w + 23, y: Math.round(y + h / 2) },
];

interface TSeed {
  key: string; label: string; x: number; y: number; w: number; h: number;
  capacity: number; sectionKey: string; chairs: { x: number; y: number }[];
}

const VENUE_LAYOUT: TSeed[] = [
  // ── Circular booth tables (yellow, below stage) ──────────────────────
  { key:"t1",  label:"1",  x:317, y:157, w:65, h:65, capacity:8, sectionKey:"booth", chairs: ring(350,190,54,7) },
  { key:"t2",  label:"2",  x:408, y:163, w:65, h:65, capacity:8, sectionKey:"booth", chairs: ring(441,196,54,7) },
  { key:"t3",  label:"3",  x:499, y:157, w:65, h:65, capacity:8, sectionKey:"booth", chairs: ring(532,190,54,7) },
  { key:"t4",  label:"4",  x:317, y:233, w:65, h:65, capacity:8, sectionKey:"booth", chairs: ring(350,266,54,7) },
  { key:"t5",  label:"5",  x:408, y:240, w:65, h:65, capacity:8, sectionKey:"booth", chairs: ring(441,273,54,7) },
  { key:"t6",  label:"6",  x:499, y:233, w:65, h:65, capacity:8, sectionKey:"booth", chairs: ring(532,266,54,7) },

  // ── Center-left rectangular tables (indigo) ───────────────────────────
  { key:"t7",  label:"7",  x:205, y:291, w:58, h:58, capacity:4, sectionKey:"center", chairs: edges(205,291,58,58) },
  { key:"t8",  label:"8",  x:278, y:278, w:58, h:58, capacity:4, sectionKey:"center", chairs: edges(278,278,58,58) },
  { key:"t9",  label:"9",  x:351, y:278, w:58, h:58, capacity:4, sectionKey:"center", chairs: edges(351,278,58,58) },
  { key:"t10", label:"10", x:424, y:288, w:58, h:58, capacity:4, sectionKey:"center", chairs: edges(424,288,58,58) },
  { key:"t11", label:"11", x:205, y:360, w:58, h:58, capacity:4, sectionKey:"center", chairs: edges(205,360,58,58) },
  { key:"t12", label:"12", x:278, y:348, w:58, h:58, capacity:4, sectionKey:"center", chairs: edges(278,348,58,58) },
  { key:"t13", label:"13", x:351, y:348, w:58, h:58, capacity:4, sectionKey:"center", chairs: edges(351,348,58,58) },
  { key:"t14", label:"14", x:424, y:358, w:58, h:58, capacity:4, sectionKey:"center", chairs: edges(424,358,58,58) },

  // ── Fixed booth seating (red) ─────────────────────────────────────────
  { key:"b1",  label:"B1", x:280, y:418, w:74, h:40, capacity:4, sectionKey:"fixed", chairs:[] },
  { key:"b2",  label:"B2", x:366, y:418, w:74, h:40, capacity:4, sectionKey:"fixed", chairs:[] },

  // ── Orange square tables (right side, 3×3 grid) ───────────────────────
  { key:"t15", label:"15", x:636, y:368, w:62, h:62, capacity:4, sectionKey:"side", chairs: edges(636,368,62,62) },
  { key:"t16", label:"16", x:716, y:368, w:62, h:62, capacity:4, sectionKey:"side", chairs: edges(716,368,62,62) },
  { key:"t17", label:"17", x:796, y:368, w:62, h:62, capacity:4, sectionKey:"side", chairs: edges(796,368,62,62) },
  { key:"t18", label:"18", x:636, y:448, w:62, h:62, capacity:4, sectionKey:"side", chairs: edges(636,448,62,62) },
  { key:"t19", label:"19", x:716, y:448, w:62, h:62, capacity:4, sectionKey:"side", chairs: edges(716,448,62,62) },
  { key:"t20", label:"20", x:796, y:448, w:62, h:62, capacity:4, sectionKey:"side", chairs: edges(796,448,62,62) },
  { key:"t21", label:"21", x:636, y:528, w:62, h:62, capacity:4, sectionKey:"side", chairs: edges(636,528,62,62) },
  { key:"t22", label:"22", x:716, y:528, w:62, h:62, capacity:4, sectionKey:"side", chairs: edges(716,528,62,62) },
  { key:"t23", label:"23", x:796, y:528, w:62, h:62, capacity:4, sectionKey:"side", chairs: edges(796,528,62,62) },
];

const SECTIONS = [
  { key:"booth",  name:"Booth Tables",  color:"#D97706" },
  { key:"center", name:"Center Tables", color:"#4F46E5" },
  { key:"side",   name:"Side Tables",   color:"#EA580C" },
  { key:"fixed",  name:"Fixed Booths",  color:"#DC2626" },
];

const SECTION_COLOR: Record<string, string> = Object.fromEntries(
  SECTIONS.map((s) => [s.name, s.color])
);

const STATUS_COLOR: Record<string, string> = {
  occupied: "#ef4444",
  reserved: "#eab308",
  cleaning: "#6b7280",
};

export default function ManagerFloor() {
  const { activeVenue } = useAppContext();
  const queryClient = useQueryClient();

  const [chairs, setChairs] = useState<ChairRecord[]>([]);
  const [selected, setSelected] = useState<DragTarget | null>(null);
  const [addMode, setAddMode] = useState<"table" | "chair" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [tableOverrides, setTableOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [seeding, setSeeding] = useState(false);

  const dragRef = useRef<{
    target: DragTarget; startX: number; startY: number; origX: number; origY: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: sections } = useListFloorSections(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListFloorSectionsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );
  const { data: tables } = useListTables(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListTablesQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  const updateTable = useUpdateTable();
  const createTableMut = useCreateTable();
  const deleteTableMut = useDeleteTable();
  const tablesQK = getListTablesQueryKey({ venueId: activeVenue?.id || "" });
  const sectionsQK = getListFloorSectionsQueryKey({ venueId: activeVenue?.id || "" });

  useEffect(() => {
    if (!activeVenue?.id) return;
    apiFetch(`/chairs?venueId=${activeVenue.id}`)
      .then((d) => setChairs(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [activeVenue?.id]);

  const seedLayout = useCallback(async () => {
    if (!activeVenue?.id) return;
    setSeeding(true);
    try {
      const allChairs: { x: number; y: number }[] = [];
      const tableDefs = VENUE_LAYOUT.map(({ chairs: c, ...t }) => { allChairs.push(...c); return t; });
      await apiFetch("/floor-layout/seed", {
        method: "POST",
        body: JSON.stringify({ venueId: activeVenue.id, sections: SECTIONS, tables: tableDefs, chairs: allChairs }),
      });
      queryClient.invalidateQueries({ queryKey: tablesQK });
      queryClient.invalidateQueries({ queryKey: sectionsQK });
      const d = await apiFetch(`/chairs?venueId=${activeVenue.id}`);
      setChairs(Array.isArray(d) ? d : []);
      setTableOverrides({});
      setSelected(null);
    } finally {
      setSeeding(false);
    }
  }, [activeVenue?.id, queryClient, tablesQK, sectionsQK]);

  const getCanvasPos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const scroll = scrollRef.current;
    if (!canvas || !scroll) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleCanvasClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!addMode || !activeVenue?.id) return;
      const el = e.target as HTMLElement;
      if (el !== canvasRef.current && !el.classList.contains("floor-bg")) return;
      const { x, y } = getCanvasPos(e);

      if (addMode === "chair") {
        const chair = await apiFetch("/chairs", {
          method: "POST",
          body: JSON.stringify({ venueId: activeVenue.id, x, y }),
        });
        setChairs((prev) => [...prev, chair]);
        setAddMode(null);
      } else if (addMode === "table") {
        const section = sections?.[0];
        if (!section) return;
        await createTableMut.mutateAsync({
          data: {
            venueId: activeVenue.id,
            sectionId: section.id,
            label: `T${(tables?.length ?? 0) + 1}`,
            capacity: 4,
            x: String(x), y: String(y), width: "80", height: "80",
          },
        });
        queryClient.invalidateQueries({ queryKey: tablesQK });
        setAddMode(null);
      }
    },
    [addMode, activeVenue?.id, sections, tables?.length, createTableMut, queryClient, tablesQK]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, target: DragTarget, origX: number, origY: number) => {
      e.stopPropagation(); e.preventDefault();
      setSelected(target);
      dragRef.current = { target, startX: e.clientX, startY: e.clientY, origX, origY };
    }, []
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newX = Math.max(0, Math.min(CANVAS_W - 10, dragRef.current.origX + dx));
    const newY = Math.max(0, Math.min(CANVAS_H - 10, dragRef.current.origY + dy));
    if (dragRef.current.target.type === "chair") {
      setChairs((prev) => prev.map((c) => c.id === dragRef.current!.target.id ? { ...c, x: newX, y: newY } : c));
    } else {
      setTableOverrides((prev) => ({ ...prev, [dragRef.current!.target.id]: { x: newX, y: newY } }));
    }
  }, []);

  const handleMouseUp = useCallback(async () => {
    if (!dragRef.current) return;
    const { target } = dragRef.current;
    if (target.type === "chair") {
      const chair = chairs.find((c) => c.id === target.id);
      if (chair) await apiFetch(`/chairs/${target.id}`, { method: "PUT", body: JSON.stringify({ x: chair.x, y: chair.y }) });
    } else {
      const ov = tableOverrides[target.id];
      if (ov) {
        await updateTable.mutateAsync({ id: target.id, data: { x: ov.x, y: ov.y } });
        queryClient.invalidateQueries({ queryKey: tablesQK });
      }
    }
    dragRef.current = null;
  }, [chairs, tableOverrides, updateTable, queryClient, tablesQK]);

  const handleRemove = useCallback(async () => {
    if (!selected) return;
    if (selected.type === "table") {
      await deleteTableMut.mutateAsync({ id: selected.id });
      queryClient.invalidateQueries({ queryKey: tablesQK });
      setTableOverrides((p) => { const n = { ...p }; delete n[selected.id]; return n; });
    } else {
      await apiFetch(`/chairs/${selected.id}`, { method: "DELETE" });
      setChairs((p) => p.filter((c) => c.id !== selected.id));
    }
    setSelected(null);
  }, [selected, deleteTableMut, queryClient, tablesQK]);

  const saveLabel = useCallback(async () => {
    if (!editingId || !editingLabel.trim()) { setEditingId(null); return; }
    await updateTable.mutateAsync({ id: editingId, data: { label: editingLabel.trim() } });
    queryClient.invalidateQueries({ queryKey: tablesQK });
    setEditingId(null);
  }, [editingId, editingLabel, updateTable, queryClient, tablesQK]);

  const getTableColor = (sectionName: string | null | undefined, status: string) =>
    STATUS_COLOR[status] ?? SECTION_COLOR[sectionName ?? ""] ?? "#4B5563";

  const isRound = (sectionName: string | null | undefined) => sectionName === "Booth Tables";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Floor Plan</h1>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={seedLayout}
            disabled={seeding}
          >
            {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LayoutTemplate className="w-4 h-4 mr-2" />}
            Load Floor Plan Layout
          </Button>
          <Button
            variant={addMode === "table" ? "default" : "outline"}
            onClick={() => setAddMode(addMode === "table" ? null : "table")}
          >
            <SquarePlus className="w-4 h-4 mr-2" /> Add Table
          </Button>
          <Button
            variant={addMode === "chair" ? "default" : "outline"}
            onClick={() => setAddMode(addMode === "chair" ? null : "chair")}
          >
            <Plus className="w-4 h-4 mr-2" /> Add Chair
          </Button>
          <Button variant="destructive" disabled={!selected} onClick={handleRemove}>
            <Trash2 className="w-4 h-4 mr-2" /> Remove
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm items-center">
        {SECTIONS.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: s.color }} />
            {s.name}
          </div>
        ))}
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /> Occupied</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-yellow-500" /> Reserved</div>
        {addMode && (
          <span className="ml-auto text-xs bg-muted px-3 py-1 rounded-full text-muted-foreground">
            Click floor to place {addMode} · Esc to cancel
          </span>
        )}
        {selected && !addMode && (
          <span className="ml-auto text-xs text-muted-foreground">
            {selected.type === "table" ? "Double-click to rename" : "Chair selected"} · Remove to delete
          </span>
        )}
      </div>

      {/* Scrollable canvas container */}
      <div
        ref={scrollRef}
        className="w-full overflow-auto border rounded-xl bg-black/10"
        style={{ maxHeight: "82vh" }}
      >
        {/* Inner canvas — exact image dimensions */}
        <div
          ref={canvasRef}
          className={`relative select-none ${addMode ? "cursor-crosshair" : "cursor-default"}`}
          style={{ width: CANVAS_W, height: CANVAS_H }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleCanvasClick}
          onKeyDown={(e) => { if (e.key === "Escape") setAddMode(null); }}
          tabIndex={0}
        >
          {/* Background floor plan — low opacity so interactive shapes stand out */}
          <img
            src={floorPlanBg}
            alt="Venue floor plan"
            className="floor-bg absolute inset-0 pointer-events-none"
            style={{ width: CANVAS_W, height: CANVAS_H, opacity: 0.22 }}
            draggable={false}
          />

          {/* Tables */}
          {tables?.map((table) => {
            const ov = tableOverrides[table.id];
            const x = ov?.x ?? Number(table.x);
            const y = ov?.y ?? Number(table.y);
            const w = Number(table.width);
            const h = Number(table.height);
            const isSel = selected?.type === "table" && selected.id === table.id;
            const isEdit = editingId === table.id;
            const round = isRound(table.sectionName);
            const bg = getTableColor(table.sectionName, table.status);

            return (
              <div
                key={table.id}
                className={`absolute flex flex-col items-center justify-center shadow-lg cursor-grab active:cursor-grabbing ${isSel ? "ring-2 ring-white ring-offset-1 shadow-2xl" : ""}`}
                style={{
                  left: x, top: y, width: w, height: h,
                  backgroundColor: bg,
                  borderRadius: round ? "50%" : "8px",
                  userSelect: "none",
                }}
                onMouseDown={(e) => handleMouseDown(e, { type: "table", id: table.id }, x, y)}
                onDoubleClick={(e) => { e.stopPropagation(); setEditingId(table.id); setEditingLabel(table.label); }}
              >
                {isEdit ? (
                  <Input
                    autoFocus
                    className="w-[88%] text-center text-xs font-bold bg-white/20 border-white/50 text-white h-6 px-1"
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onBlur={saveLabel}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveLabel();
                      if (e.key === "Escape") setEditingId(null);
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-white font-bold text-xs leading-tight px-1 text-center drop-shadow">
                    {table.label}
                  </span>
                )}
                <span className="text-white/70 text-[9px] drop-shadow">{table.capacity}p</span>
              </div>
            );
          })}

          {/* Chairs */}
          {chairs.map((chair) => {
            const isSel = selected?.type === "chair" && selected.id === chair.id;
            return (
              <div
                key={chair.id}
                className={`absolute rounded-full cursor-grab active:cursor-grabbing shadow ${isSel ? "ring-2 ring-white" : ""}`}
                style={{
                  left: Number(chair.x) - 12,
                  top: Number(chair.y) - 12,
                  width: 24, height: 24,
                  backgroundColor: "#6b7280",
                  border: "2px solid #4b5563",
                  userSelect: "none",
                }}
                onMouseDown={(e) => handleMouseDown(e, { type: "chair", id: chair.id }, Number(chair.x), Number(chair.y))}
              />
            );
          })}

          {!tables?.length && !chairs.length && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <LayoutTemplate className="w-10 h-10 opacity-30" />
              <p className="font-medium">Floor plan is empty</p>
              <p className="text-sm opacity-70">Click "Load Floor Plan Layout" to populate from the venue image,<br/>or use Add Table / Add Chair to build manually.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
