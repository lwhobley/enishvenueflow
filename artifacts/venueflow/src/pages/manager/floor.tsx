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
type DragTarget  = { type: "table" | "chair"; id: string };

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Canvas is exactly the image size ────────────────────────────────────────
const CW = 1294;
const CH = 832;

// ── Helpers for seeding chair positions ─────────────────────────────────────
const ring = (cx: number, cy: number, r: number, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i * Math.PI * 2) / n - Math.PI / 2;
    return { x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) };
  });

const edgeChairs = (x: number, y: number, w: number, h: number) => [
  { x: Math.round(x + w / 2), y: y - 22 },
  { x: Math.round(x + w / 2), y: y + h + 22 },
  { x: x - 22, y: Math.round(y + h / 2) },
  { x: x + w + 22, y: Math.round(y + h / 2) },
];

// ── Layout seed — coordinates mapped 1-to-1 to the 1294×832 image ───────────
interface TSeed {
  key: string; label: string; x: number; y: number; w: number; h: number;
  capacity: number; sectionKey: string; chairs: { x: number; y: number }[];
}

const LAYOUT: TSeed[] = [
  // Circular amber booth tables (yellow circles, 2 curved rows below stage)
  { key:"t1", label:"1", x:317, y:155, w:66, h:66, capacity:8, sectionKey:"booth", chairs:ring(350,188,54,7) },
  { key:"t2", label:"2", x:408, y:161, w:66, h:66, capacity:8, sectionKey:"booth", chairs:ring(441,194,54,7) },
  { key:"t3", label:"3", x:499, y:155, w:66, h:66, capacity:8, sectionKey:"booth", chairs:ring(532,188,54,7) },
  { key:"t4", label:"4", x:317, y:232, w:66, h:66, capacity:8, sectionKey:"booth", chairs:ring(350,265,54,7) },
  { key:"t5", label:"5", x:408, y:239, w:66, h:66, capacity:8, sectionKey:"booth", chairs:ring(441,272,54,7) },
  { key:"t6", label:"6", x:499, y:232, w:66, h:66, capacity:8, sectionKey:"booth", chairs:ring(532,265,54,7) },

  // Indigo rectangular center tables (left-center fan area)
  { key:"t7",  label:"7",  x:206, y:290, w:58, h:58, capacity:4, sectionKey:"center", chairs:edgeChairs(206,290,58,58) },
  { key:"t8",  label:"8",  x:278, y:278, w:58, h:58, capacity:4, sectionKey:"center", chairs:edgeChairs(278,278,58,58) },
  { key:"t9",  label:"9",  x:350, y:278, w:58, h:58, capacity:4, sectionKey:"center", chairs:edgeChairs(350,278,58,58) },
  { key:"t10", label:"10", x:422, y:287, w:58, h:58, capacity:4, sectionKey:"center", chairs:edgeChairs(422,287,58,58) },
  { key:"t11", label:"11", x:206, y:358, w:58, h:58, capacity:4, sectionKey:"center", chairs:edgeChairs(206,358,58,58) },
  { key:"t12", label:"12", x:278, y:347, w:58, h:58, capacity:4, sectionKey:"center", chairs:edgeChairs(278,347,58,58) },
  { key:"t13", label:"13", x:350, y:347, w:58, h:58, capacity:4, sectionKey:"center", chairs:edgeChairs(350,347,58,58) },
  { key:"t14", label:"14", x:422, y:357, w:58, h:58, capacity:4, sectionKey:"center", chairs:edgeChairs(422,357,58,58) },

  // Red fixed booth seating (lower center)
  { key:"b1", label:"B1", x:280, y:417, w:74, h:40, capacity:4, sectionKey:"fixed", chairs:[] },
  { key:"b2", label:"B2", x:366, y:417, w:74, h:40, capacity:4, sectionKey:"fixed", chairs:[] },

  // Orange square tables — right side 3×3 grid
  { key:"t15", label:"15", x:637, y:367, w:62, h:62, capacity:4, sectionKey:"side", chairs:edgeChairs(637,367,62,62) },
  { key:"t16", label:"16", x:717, y:367, w:62, h:62, capacity:4, sectionKey:"side", chairs:edgeChairs(717,367,62,62) },
  { key:"t17", label:"17", x:797, y:367, w:62, h:62, capacity:4, sectionKey:"side", chairs:edgeChairs(797,367,62,62) },
  { key:"t18", label:"18", x:637, y:447, w:62, h:62, capacity:4, sectionKey:"side", chairs:edgeChairs(637,447,62,62) },
  { key:"t19", label:"19", x:717, y:447, w:62, h:62, capacity:4, sectionKey:"side", chairs:edgeChairs(717,447,62,62) },
  { key:"t20", label:"20", x:797, y:447, w:62, h:62, capacity:4, sectionKey:"side", chairs:edgeChairs(797,447,62,62) },
  { key:"t21", label:"21", x:637, y:527, w:62, h:62, capacity:4, sectionKey:"side", chairs:edgeChairs(637,527,62,62) },
  { key:"t22", label:"22", x:717, y:527, w:62, h:62, capacity:4, sectionKey:"side", chairs:edgeChairs(717,527,62,62) },
  { key:"t23", label:"23", x:797, y:527, w:62, h:62, capacity:4, sectionKey:"side", chairs:edgeChairs(797,527,62,62) },
];

const SECTIONS = [
  { key:"booth",  name:"Booth Tables",  color:"#D97706" },
  { key:"center", name:"Center Tables", color:"#4F46E5" },
  { key:"side",   name:"Side Tables",   color:"#EA580C" },
  { key:"fixed",  name:"Fixed Booths",  color:"#DC2626" },
];

const SEC_COLOR: Record<string, string> = Object.fromEntries(SECTIONS.map(s => [s.name, s.color]));
const STATUS_COLOR: Record<string, string> = { occupied:"#ef4444", reserved:"#eab308", cleaning:"#6b7280" };

export default function ManagerFloor() {
  const { activeVenue } = useAppContext();
  const queryClient   = useQueryClient();

  const [chairs, setChairs]             = useState<ChairRecord[]>([]);
  const [selected, setSelected]         = useState<DragTarget | null>(null);
  const [addMode, setAddMode]           = useState<"table"|"chair"|null>(null);
  const [editingId, setEditingId]       = useState<string|null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [tableOv, setTableOv]           = useState<Record<string,{x:number;y:number}>>({});
  const [seeding, setSeeding]           = useState(false);
  const [scale, setScale]               = useState(1);

  const scaleRef   = useRef(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLDivElement>(null);
  const dragRef      = useRef<{ target:DragTarget; sx:number; sy:number; ox:number; oy:number }|null>(null);

  // Compute scale so the canvas always fits the container width exactly
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const s = Math.min(1, el.clientWidth / CW);
      setScale(s);
      scaleRef.current = s;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { data: sections } = useListFloorSections(
    { venueId: activeVenue?.id||"" },
    { query: { enabled:!!activeVenue?.id, queryKey:getListFloorSectionsQueryKey({venueId:activeVenue?.id||""}) } }
  );
  const { data: tables } = useListTables(
    { venueId: activeVenue?.id||"" },
    { query: { enabled:!!activeVenue?.id, queryKey:getListTablesQueryKey({venueId:activeVenue?.id||""}) } }
  );

  const updateTable   = useUpdateTable();
  const createTableMut = useCreateTable();
  const deleteTableMut = useDeleteTable();
  const tablesQK   = getListTablesQueryKey({ venueId:activeVenue?.id||"" });
  const sectionsQK = getListFloorSectionsQueryKey({ venueId:activeVenue?.id||"" });

  useEffect(() => {
    if (!activeVenue?.id) return;
    apiFetch(`/chairs?venueId=${activeVenue.id}`)
      .then(d => setChairs(Array.isArray(d) ? d : []))
      .catch(()=>{});
  }, [activeVenue?.id]);

  // ── Seed layout ─────────────────────────────────────────────────────────────
  const seedLayout = useCallback(async () => {
    if (!activeVenue?.id) return;
    setSeeding(true);
    try {
      const allChairs: {x:number;y:number}[] = [];
      const tableDefs = LAYOUT.map(({ chairs: c, ...t }) => { allChairs.push(...c); return t; });
      await apiFetch("/floor-layout/seed", {
        method:"POST",
        body: JSON.stringify({ venueId:activeVenue.id, sections:SECTIONS, tables:tableDefs, chairs:allChairs }),
      });
      queryClient.invalidateQueries({ queryKey:tablesQK });
      queryClient.invalidateQueries({ queryKey:sectionsQK });
      const d = await apiFetch(`/chairs?venueId=${activeVenue.id}`);
      setChairs(Array.isArray(d) ? d : []);
      setTableOv({});
      setSelected(null);
    } finally {
      setSeeding(false);
    }
  }, [activeVenue?.id, queryClient, tablesQK, sectionsQK]);

  // ── Canvas coordinate helper (corrects for CSS scale transform) ─────────────
  const canvasPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scaleRef.current,
      y: (e.clientY - rect.top)  / scaleRef.current,
    };
  };

  // ── Click to place in add mode ───────────────────────────────────────────────
  const handleCanvasClick = useCallback(async (e: React.MouseEvent) => {
    if (!addMode || !activeVenue?.id) return;
    const el = e.target as HTMLElement;
    if (el !== canvasRef.current && !el.classList.contains("floor-bg")) return;
    const { x, y } = canvasPos(e);

    if (addMode === "chair") {
      const chair = await apiFetch("/chairs", { method:"POST", body:JSON.stringify({venueId:activeVenue.id,x,y}) });
      setChairs(prev => [...prev, chair]);
      setAddMode(null);
    } else {
      const sec = sections?.[0];
      if (!sec) return;
      await createTableMut.mutateAsync({ data:{
        venueId:activeVenue.id, sectionId:sec.id,
        label:`T${(tables?.length??0)+1}`, capacity:4,
        x:String(x), y:String(y), width:"80", height:"80",
      }});
      queryClient.invalidateQueries({ queryKey:tablesQK });
      setAddMode(null);
    }
  }, [addMode, activeVenue?.id, sections, tables?.length, createTableMut, queryClient, tablesQK]);

  // ── Drag handlers ────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent, target: DragTarget, ox: number, oy: number) => {
    e.stopPropagation(); e.preventDefault();
    setSelected(target);
    dragRef.current = { target, sx:e.clientX, sy:e.clientY, ox, oy };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const s = scaleRef.current;
    const dx = (e.clientX - dragRef.current.sx) / s;
    const dy = (e.clientY - dragRef.current.sy) / s;
    const nx = Math.max(0, Math.min(CW - 10, dragRef.current.ox + dx));
    const ny = Math.max(0, Math.min(CH - 10, dragRef.current.oy + dy));
    if (dragRef.current.target.type === "chair") {
      setChairs(prev => prev.map(c => c.id===dragRef.current!.target.id ? {...c, x:nx, y:ny} : c));
    } else {
      setTableOv(prev => ({ ...prev, [dragRef.current!.target.id]: { x:nx, y:ny } }));
    }
  }, []);

  const handleMouseUp = useCallback(async () => {
    if (!dragRef.current) return;
    const { target } = dragRef.current;
    if (target.type === "chair") {
      const ch = chairs.find(c => c.id===target.id);
      if (ch) await apiFetch(`/chairs/${target.id}`, { method:"PUT", body:JSON.stringify({x:ch.x,y:ch.y}) });
    } else {
      const ov = tableOv[target.id];
      if (ov) {
        await updateTable.mutateAsync({ id:target.id, data:{ x:ov.x, y:ov.y } });
        queryClient.invalidateQueries({ queryKey:tablesQK });
      }
    }
    dragRef.current = null;
  }, [chairs, tableOv, updateTable, queryClient, tablesQK]);

  const handleRemove = useCallback(async () => {
    if (!selected) return;
    if (selected.type === "table") {
      await deleteTableMut.mutateAsync({ id:selected.id });
      queryClient.invalidateQueries({ queryKey:tablesQK });
      setTableOv(p => { const n={...p}; delete n[selected.id]; return n; });
    } else {
      await apiFetch(`/chairs/${selected.id}`, { method:"DELETE" });
      setChairs(p => p.filter(c => c.id!==selected.id));
    }
    setSelected(null);
  }, [selected, deleteTableMut, queryClient, tablesQK]);

  const saveLabel = useCallback(async () => {
    if (!editingId || !editingLabel.trim()) { setEditingId(null); return; }
    await updateTable.mutateAsync({ id:editingId, data:{ label:editingLabel.trim() } });
    queryClient.invalidateQueries({ queryKey:tablesQK });
    setEditingId(null);
  }, [editingId, editingLabel, updateTable, queryClient, tablesQK]);

  const tableColor = (sectionName:string|null|undefined, status:string) =>
    STATUS_COLOR[status] ?? SEC_COLOR[sectionName??""] ?? "#4B5563";

  return (
    <div className="space-y-3">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Floor Plan</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={seedLayout} disabled={seeding}>
            {seeding
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/>
              : <LayoutTemplate className="w-4 h-4 mr-2"/>}
            Load Floor Plan Layout
          </Button>
          <Button variant={addMode==="table"?"default":"outline"} onClick={()=>setAddMode(addMode==="table"?null:"table")}>
            <SquarePlus className="w-4 h-4 mr-2"/> Add Table
          </Button>
          <Button variant={addMode==="chair"?"default":"outline"} onClick={()=>setAddMode(addMode==="chair"?null:"chair")}>
            <Plus className="w-4 h-4 mr-2"/> Add Chair
          </Button>
          <Button variant="destructive" disabled={!selected} onClick={handleRemove}>
            <Trash2 className="w-4 h-4 mr-2"/> Remove
          </Button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs items-center">
        {SECTIONS.map(s => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded inline-block" style={{backgroundColor:s.color}}/>
            {s.name}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full inline-block bg-red-500"/>Occupied
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full inline-block bg-yellow-500"/>Reserved
        </span>
        {addMode && (
          <span className="ml-auto bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
            Click floor to place {addMode} · Esc to cancel
          </span>
        )}
        {selected && !addMode && (
          <span className="ml-auto text-muted-foreground">
            {selected.type==="table" ? "Double-click to rename" : "Chair selected"} · Remove to delete
          </span>
        )}
      </div>

      {/* ── Outer container — measured for scale ── */}
      <div
        ref={containerRef}
        className={`w-full overflow-hidden border rounded-xl relative ${addMode?"cursor-crosshair":""}`}
        style={{ height: CH * scale }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        onKeyDown={e => { if (e.key==="Escape") setAddMode(null); }}
        tabIndex={0}
      >
        {/* ── Inner canvas at full 1294×832, scaled down via CSS ── */}
        <div
          ref={canvasRef}
          className="absolute top-0 left-0 select-none"
          style={{ width:CW, height:CH, transform:`scale(${scale})`, transformOrigin:"top left" }}
        >
          {/* Floor plan image — the actual venue layout */}
          <img
            src={floorPlanBg}
            alt="Venue floor plan"
            className="floor-bg absolute inset-0 pointer-events-none"
            style={{ width:CW, height:CH, opacity:1 }}
            draggable={false}
          />

          {/* ── Tables ── */}
          {tables?.map(table => {
            const ov  = tableOv[table.id];
            const x   = ov?.x ?? Number(table.x);
            const y   = ov?.y ?? Number(table.y);
            const w   = Number(table.width);
            const h   = Number(table.height);
            const sel = selected?.type==="table" && selected.id===table.id;
            const editing = editingId===table.id;
            const round   = table.sectionName==="Booth Tables";
            const bg      = tableColor(table.sectionName, table.status);

            return (
              <div
                key={table.id}
                className={`absolute flex flex-col items-center justify-center cursor-grab active:cursor-grabbing ${sel?"ring-4 ring-white ring-offset-2":"ring-2 ring-white/80"}`}
                style={{ left:x, top:y, width:w, height:h, backgroundColor:bg,
                         borderRadius:round?"50%":"8px", userSelect:"none",
                         boxShadow:"0 4px 12px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.4)" }}
                onMouseDown={e => handleMouseDown(e,{type:"table",id:table.id},x,y)}
                onDoubleClick={e => { e.stopPropagation(); setEditingId(table.id); setEditingLabel(table.label); }}
              >
                {editing ? (
                  <Input
                    autoFocus
                    className="w-[88%] text-center text-xs font-bold bg-white/20 border-white/50 text-white h-6 px-1"
                    value={editingLabel}
                    onChange={e => setEditingLabel(e.target.value)}
                    onBlur={saveLabel}
                    onKeyDown={e => {
                      if (e.key==="Enter") saveLabel();
                      if (e.key==="Escape") setEditingId(null);
                      e.stopPropagation();
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-white font-bold text-xs leading-tight px-1 text-center drop-shadow">
                    {table.label}
                  </span>
                )}
                <span className="text-white/75 text-[9px] drop-shadow">{table.capacity}p</span>
              </div>
            );
          })}

          {/* ── Chairs ── */}
          {chairs.map(chair => {
            const sel = selected?.type==="chair" && selected.id===chair.id;
            return (
              <div
                key={chair.id}
                className={`absolute rounded-full cursor-grab active:cursor-grabbing shadow ${sel?"ring-2 ring-white":""}`}
                style={{ left:Number(chair.x)-12, top:Number(chair.y)-12,
                         width:24, height:24, backgroundColor:"#374151",
                         border:"2.5px solid #fff", userSelect:"none",
                         boxShadow:"0 2px 6px rgba(0,0,0,0.6)" }}
                onMouseDown={e => handleMouseDown(e,{type:"chair",id:chair.id},Number(chair.x),Number(chair.y))}
              />
            );
          })}

          {/* ── Empty state ── */}
          {!tables?.length && !chairs.length && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <LayoutTemplate className="w-10 h-10 opacity-30"/>
              <p className="font-medium">Floor plan is empty</p>
              <p className="text-sm opacity-70 text-center px-4">
                Click "Load Floor Plan Layout" to populate from your venue image,<br/>
                or use Add Table / Add Chair to build manually.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
