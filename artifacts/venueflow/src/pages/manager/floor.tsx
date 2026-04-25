import { useState, useRef, useCallback, useEffect } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { useAuth } from "@/contexts/auth-context";
import {
  useUpdateTable,
  useDeleteTable,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Square, Armchair, RotateCw, ListOrdered, Copy } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { TableLegend } from "@/components/table-legend";
import floorPlanBg from "@assets/IMG_2248_1776293611211.png";

type ChairRecord = { id: string; venueId: string; x: number; y: number; width: number; height: number; rotation?: number };
type DragTarget  = { type: "table" | "chair"; id: string };
type TableShape  = "square" | "crescent";
type ResizeMode  = "se" | "e" | "s";

// Floor plans split into independent layouts: "restaurant" (default,
// daytime dining) and "nightlife" (the bar / club configuration). Each
// scope has its own tables, chairs, and sections, edited independently.
export type FloorScope = "restaurant" | "nightlife";

type FloorTable = {
  id: string;
  venueId: string;
  sectionId: string;
  label: string;
  capacity: number;
  status: string;
  x: number; y: number; width: number; height: number;
  shape: string;
  rotation: number;
  price: number | null;
  purchaserName: string | null;
  sectionName: string | null;
};

type FloorSection = {
  id: string;
  venueId: string;
  name: string;
  capacity: number;
  color: string;
};

// Normalize any incoming rotation to 0/90/180/270.
function normalizeRot(deg: number | null | undefined): number {
  if (typeof deg !== "number" || !Number.isFinite(deg)) return 0;
  const n = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  return n;
}

const MIN_TABLE = 30;
const MAX_TABLE = 400;
const MIN_CHAIR = 10;
const MAX_CHAIR = 80;

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

// U-shape (banquette) — opens toward the bottom at rotation 0. Uses a shallow
// elliptical arc at the top so the legs dominate and the curve is gentle.
function UShapeTableShape({ w, h, selected }: { w: number; h: number; selected: boolean }) {
  const t         = Math.max(6, Math.min(w, h) * 0.22); // band thickness
  const bowDepth  = Math.max(10, Math.min(w * 0.22, h * 0.30));
  const bowStartY = bowDepth; // legs start at y = bowStartY; arc apex sits at y = 0
  const H         = Math.max(h, bowStartY + 4);

  const outerRx = w / 2;
  const outerRy = bowDepth;
  const innerRx = Math.max(1, w / 2 - t);
  const innerRy = Math.max(1, bowDepth - t);

  // Outer: left leg → shallow arc across the top → right leg → bottom edge.
  // Inner: same path inset by thickness `t`, traversed the other way so the
  // fill rule carves out the middle.
  const d = [
    `M 0,${H}`,
    `L 0,${bowStartY}`,
    `A ${outerRx},${outerRy} 0 0 1 ${w},${bowStartY}`,
    `L ${w},${H}`,
    `L ${w - t},${H}`,
    `L ${w - t},${bowStartY}`,
    `A ${innerRx},${innerRy} 0 0 0 ${t},${bowStartY}`,
    `L ${t},${H}`,
    `Z`,
  ].join(" ");

  return (
    <svg
      width={w} height={H}
      style={{
        filter: selected
          ? "drop-shadow(0 0 4px #3b82f6) drop-shadow(0 4px 8px rgba(0,0,0,0.5))"
          : "drop-shadow(0 3px 6px rgba(0,0,0,0.45))",
        overflow: "visible",
      }}
    >
      <path
        d={d}
        fill="rgba(255,255,255,0.88)"
        stroke={selected ? "#3b82f6" : "#1f2937"}
        strokeWidth={selected ? 3 : 2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── U-shaped chair (small crescent) ─────────────────────────────────────────
function ChairShape({ w, h, selected }: { w: number; h: number; selected: boolean }) {
  const radius = Math.min(w, h * 1.6) / 2;
  return (
    <div
      style={{
        width: w, height: h,
        backgroundColor: "#1f2937",
        borderRadius: `${radius}px ${radius}px 0 0`,
        border: selected ? "2px solid #3b82f6" : "1.5px solid #374151",
        boxShadow: "0 2px 5px rgba(0,0,0,0.55)",
      }}
    />
  );
}

// ── Rotate handle — small floating button above the selected shape ─────────
function RotateHandle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick(); }}
      aria-label="Rotate 90°"
      style={{
        position: "absolute",
        top: -26, left: "50%", marginLeft: -11,
        width: 22, height: 22,
        background: "#fff",
        color: "#1f2937",
        border: "2px solid #3b82f6",
        borderRadius: "50%",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
        padding: 0,
        touchAction: "none",
        zIndex: 11,
      }}
    >
      <RotateCw size={12} strokeWidth={2.5} />
    </button>
  );
}

// ── Square handle drawn at a corner / edge of a selected item ──────────────
function ResizeHandle({
  pos, onMouseDown, onTouchStart,
}: {
  pos: ResizeMode;
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
}) {
  const base: React.CSSProperties = {
    position: "absolute", width: 12, height: 12,
    background: "#3b82f6", border: "2px solid #fff",
    borderRadius: 3, boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
    touchAction: "none", zIndex: 10,
  };
  const placement: Record<ResizeMode, React.CSSProperties> = {
    se: { right: -6, bottom: -6, cursor: "nwse-resize" },
    e:  { right: -6, top: "50%", marginTop: -6, cursor: "ew-resize" },
    s:  { bottom: -6, left: "50%", marginLeft: -6, cursor: "ns-resize" },
  };
  return (
    <div
      style={{ ...base, ...placement[pos] }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    />
  );
}

export default function ManagerFloor({
  scope = "restaurant",
  title = "Floor Plan",
}: { scope?: FloorScope; title?: string } = {}) {
  const { activeVenue } = useAppContext();
  const { user }        = useAuth();
  const isAdmin         = user?.isAdmin ?? false;
  const queryClient     = useQueryClient();
  const { toast }       = useToast();

  const [chairs, setChairs]             = useState<ChairRecord[]>([]);
  const [selected, setSelected]         = useState<DragTarget | null>(null);
  const [addMode, setAddMode]           = useState<"square" | "crescent" | "chair" | null>(null);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [confirmRenumber, setConfirmRenumber] = useState(false);
  const [renumbering, setRenumbering]         = useState(false);
  const [confirmCopy, setConfirmCopy]         = useState(false);
  const [copying, setCopying]                 = useState(false);
  const [tableOv, setTableOv]           = useState<Record<string, { x: number; y: number; w?: number; h?: number; r?: number }>>({});
  const [scale, setScale]               = useState(1);
  // `true` while the user is actively dragging/resizing — pauses polling so
  // incoming server data can't snap an in-progress shape back.
  const [isInteracting, setIsInteracting] = useState(false);
  const interactionRef                    = useRef(false);

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

  // Both query keys carry the scope so the restaurant and nightlife
  // floor plans cache independently — switching pages doesn't pollute
  // the other plan with the wrong tables.
  const venueId = activeVenue?.id || "";
  const tablesQK   = ["/tables", venueId, scope] as const;
  const sectionsQK = ["/floor-sections", venueId, scope] as const;

  const { data: sections } = useQuery<FloorSection[]>({
    queryKey: sectionsQK,
    enabled: !!venueId,
    queryFn: async () => {
      return await apiFetch(`/floor-sections?venueId=${venueId}&scope=${scope}`);
    },
  });

  const { data: tables } = useQuery<FloorTable[]>({
    queryKey: tablesQK,
    enabled: !!venueId,
    queryFn: async () => {
      return await apiFetch(`/tables?venueId=${venueId}&scope=${scope}`);
    },
    // Poll every 5s for real-time sync across clients (browser + PWA).
    // Pause while the current user is mid-drag so their move can't be
    // clobbered by a remote snapshot. React Query already skips
    // background tabs / hidden PWAs; we rely on that default.
    refetchInterval: isInteracting ? false : 5000,
    refetchOnWindowFocus: true,
  });

  const updateTable    = useUpdateTable();
  const deleteTableMut = useDeleteTable();

  const otherScope: FloorScope = scope === "restaurant" ? "nightlife" : "restaurant";
  const otherScopeLabel = otherScope === "restaurant" ? "Restaurant" : "Nightlife";

  const handleCopyFromOther = async () => {
    if (!activeVenue?.id || copying) return;
    setCopying(true);
    try {
      const result = await apiFetch("/floor-plan/copy", {
        method: "POST",
        body: JSON.stringify({ venueId: activeVenue.id, fromScope: otherScope, toScope: scope }),
      }) as { tables: number; chairs: number; sections: number };
      await queryClient.invalidateQueries({ queryKey: tablesQK });
      await queryClient.invalidateQueries({ queryKey: sectionsQK });
      // Force chair refresh next tick.
      try {
        const d = await apiFetch(`/chairs?venueId=${activeVenue.id}&scope=${scope}`);
        setChairs(Array.isArray(d) ? d : []);
      } catch { /* ignore */ }
      toast({
        title: "Floor plan copied",
        description: `Copied ${result.tables} tables and ${result.chairs} chairs from ${otherScopeLabel}.`,
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCopying(false);
      setConfirmCopy(false);
    }
  };

  const handleRenumber = async () => {
    if (!activeVenue?.id || renumbering) return;
    setRenumbering(true);
    try {
      const result = await apiFetch("/tables/renumber", {
        method: "POST",
        body: JSON.stringify({ venueId: activeVenue.id, scope }),
      }) as { count: number };
      await queryClient.invalidateQueries({ queryKey: tablesQK });
      toast({
        title: "Tables renumbered",
        description: `${result.count} table${result.count === 1 ? "" : "s"} relabeled T1–T${result.count}.`,
      });
    } catch (err) {
      toast({
        title: "Failed to renumber",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRenumbering(false);
      setConfirmRenumber(false);
    }
  };

  // Poll chairs on the same cadence as tables, skipping polls during an
  // active interaction so we don't stomp on the in-flight drag.
  useEffect(() => {
    if (!activeVenue?.id) return;
    let mounted = true;
    const load = async () => {
      if (interactionRef.current) return;
      try {
        const d = await apiFetch(`/chairs?venueId=${activeVenue.id}&scope=${scope}`);
        if (mounted) setChairs(Array.isArray(d) ? d : []);
      } catch {
        /* ignore transient errors */
      }
    };
    void load();
    const interval = setInterval(load, 5000);
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [activeVenue?.id, scope]);

  // Ensure at least one section exists
  const ensureSection = useCallback(async (): Promise<string | null> => {
    if (sections?.[0]) return sections[0].id;
    if (!activeVenue?.id) return null;
    const s = await apiFetch("/floor-sections", {
      method: "POST",
      body: JSON.stringify({ venueId: activeVenue.id, name: "Main Floor", capacity: 0, scope }),
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
    if (!isAdmin || !addMode || !activeVenue?.id) return;
    const el = e.target as HTMLElement;
    if (el !== canvasRef.current && !el.classList.contains("floor-bg")) return;
    const { x, y } = canvasPos(e);

    if (addMode === "chair") {
      const chair = await apiFetch("/chairs", {
        method: "POST",
        body: JSON.stringify({ venueId: activeVenue.id, x, y, scope }),
      });
      setChairs(prev => [...prev, chair]);
    } else {
      const sectionId = await ensureSection();
      if (!sectionId) return;
      const isCresc = addMode === "crescent";
      const w = isCresc ? 90 : 80;
      const h = isCresc ? 45 : 80;
      await apiFetch("/tables", {
        method: "POST",
        body: JSON.stringify({
          venueId: activeVenue.id, sectionId, scope,
          label: `T${(tables?.length ?? 0) + 1}`,
          capacity: isCresc ? 6 : 4,
          x: String(x), y: String(y),
          width: String(w), height: String(h),
          shape: addMode,
        }),
      });
      queryClient.invalidateQueries({ queryKey: tablesQK });
    }
    setAddMode(null);
  }, [addMode, activeVenue?.id, ensureSection, scope, tables?.length, queryClient, tablesQK]);

  // Keep latest drag-save data in refs so window listeners can access them
  const chairsRef   = useRef<ChairRecord[]>([]);
  const tableOvRef  = useRef<Record<string, { x: number; y: number }>>({});
  useEffect(() => { chairsRef.current = chairs; }, [chairs]);
  useEffect(() => { tableOvRef.current = tableOv; }, [tableOv]);

  const startDrag = useCallback((clientX: number, clientY: number, target: DragTarget, ox: number, oy: number) => {
    setSelected(target);
    dragRef.current = { target, sx: clientX, sy: clientY, ox, oy };
    interactionRef.current = true;
    setIsInteracting(true);

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

    // Declare cleanup first so finishDrag can reference it without TDZ issues
    let onMouseMove: (ev: MouseEvent) => void;
    let onMouseUp:   () => void;
    let onTouchMove: (ev: TouchEvent) => void;
    let onTouchEnd:  () => void;

    const cleanup = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend",  onTouchEnd);
    };

    const finishDrag = async () => {
      cleanup();
      if (!dragRef.current) {
        interactionRef.current = false;
        setIsInteracting(false);
        return;
      }
      const { target: t } = dragRef.current;
      dragRef.current = null;
      try {
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
      } catch (err) {
        console.error("Failed to persist drag:", err);
      } finally {
        interactionRef.current = false;
        setIsInteracting(false);
      }
    };

    onMouseMove = (ev: MouseEvent) => applyMove(ev.clientX, ev.clientY);
    onMouseUp   = () => { void finishDrag(); };
    onTouchMove = (ev: TouchEvent) => {
      if (ev.cancelable) ev.preventDefault();
      const t = ev.touches[0];
      if (t) applyMove(t.clientX, t.clientY);
    };
    onTouchEnd  = () => { void finishDrag(); };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend",  onTouchEnd);
  }, [updateTable, queryClient, tablesQK]);

  const handleMouseDown = useCallback((e: React.MouseEvent, target: DragTarget, ox: number, oy: number) => {
    if (!isAdmin) return;
    e.stopPropagation(); e.preventDefault();
    startDrag(e.clientX, e.clientY, target, ox, oy);
  }, [isAdmin, startDrag]);

  const handleTouchStart = useCallback((e: React.TouchEvent, target: DragTarget, ox: number, oy: number) => {
    if (!isAdmin) return;
    e.stopPropagation(); e.preventDefault();
    startDrag(e.touches[0].clientX, e.touches[0].clientY, target, ox, oy);
  }, [isAdmin, startDrag]);

  // ── Resize: live in tableOv (for tables) or chairs state (for chairs),
  // persists on pointer-up via the same PUT endpoints used for moves.
  const startResize = useCallback((
    clientX: number, clientY: number, target: DragTarget, mode: ResizeMode,
    startW: number, startH: number,
  ) => {
    setSelected(target);
    interactionRef.current = true;
    setIsInteracting(true);
    const sx = clientX, sy = clientY;
    const isChair = target.type === "chair";
    const minSz   = isChair ? MIN_CHAIR : MIN_TABLE;
    const maxSz   = isChair ? MAX_CHAIR : MAX_TABLE;

    let lastW = startW, lastH = startH;

    const apply = (cx: number, cy: number) => {
      const s = scaleRef.current;
      const dx = (cx - sx) / s;
      const dy = (cy - sy) / s;
      let w = startW, h = startH;
      if (mode === "se" || mode === "e") w = Math.max(minSz, Math.min(maxSz, startW + dx));
      if (mode === "se" || mode === "s") h = Math.max(minSz, Math.min(maxSz, startH + dy));
      lastW = w; lastH = h;
      if (target.type === "table") {
        setTableOv(prev => {
          const cur = prev[target.id] ?? { x: 0, y: 0 };
          return { ...prev, [target.id]: { ...cur, w, h } };
        });
      } else {
        setChairs(prev => prev.map(c => c.id === target.id ? { ...c, width: w, height: h } : c));
      }
    };

    let onMove: (ev: MouseEvent) => void;
    let onUp: () => void;
    let onTMove: (ev: TouchEvent) => void;
    let onTEnd: () => void;

    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
      window.removeEventListener("touchmove", onTMove);
      window.removeEventListener("touchend",  onTEnd);
    };

    const finish = async () => {
      cleanup();
      try {
        if (target.type === "table") {
          await updateTable.mutateAsync({ id: target.id, data: { width: lastW, height: lastH } });
          queryClient.invalidateQueries({ queryKey: tablesQK });
        } else {
          await apiFetch(`/chairs/${target.id}`, {
            method: "PUT",
            body: JSON.stringify({ width: lastW, height: lastH }),
          });
        }
      } catch (err) {
        console.error("Failed to persist resize:", err);
      } finally {
        interactionRef.current = false;
        setIsInteracting(false);
      }
    };

    onMove  = (ev) => apply(ev.clientX, ev.clientY);
    onUp    = () => { void finish(); };
    onTMove = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const t = ev.touches[0];
      if (t) apply(t.clientX, t.clientY);
    };
    onTEnd  = () => { void finish(); };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    window.addEventListener("touchmove", onTMove, { passive: false });
    window.addEventListener("touchend",  onTEnd);
  }, [updateTable, queryClient, tablesQK]);

  const handleResizeMouseDown = useCallback((
    e: React.MouseEvent, target: DragTarget, mode: ResizeMode, w: number, h: number,
  ) => {
    if (!isAdmin) return;
    e.stopPropagation(); e.preventDefault();
    startResize(e.clientX, e.clientY, target, mode, w, h);
  }, [isAdmin, startResize]);

  const handleResizeTouchStart = useCallback((
    e: React.TouchEvent, target: DragTarget, mode: ResizeMode, w: number, h: number,
  ) => {
    if (!isAdmin) return;
    e.stopPropagation(); e.preventDefault();
    startResize(e.touches[0].clientX, e.touches[0].clientY, target, mode, w, h);
  }, [isAdmin, startResize]);

  const rotateSelected = useCallback(async (target: DragTarget, currentRot: number) => {
    if (!isAdmin) return;
    const next = normalizeRot(currentRot + 90);
    if (target.type === "table") {
      setTableOv(prev => {
        const cur = prev[target.id] ?? { x: 0, y: 0 };
        return { ...prev, [target.id]: { ...cur, r: next } };
      });
      try {
        await apiFetch(`/tables/${target.id}`, {
          method: "PUT",
          body: JSON.stringify({ rotation: next }),
        });
        queryClient.invalidateQueries({ queryKey: tablesQK });
      } catch (err) {
        console.error("Failed to persist rotation:", err);
      }
    } else {
      setChairs(prev => prev.map(c => c.id === target.id ? { ...c, rotation: next } : c));
      try {
        await apiFetch(`/chairs/${target.id}`, {
          method: "PUT",
          body: JSON.stringify({ rotation: next }),
        });
      } catch (err) {
        console.error("Failed to persist rotation:", err);
      }
    }
  }, [isAdmin, queryClient, tablesQK]);

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
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {isAdmin ? (
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
              <span className="mr-2 text-base leading-none">⊔</span> Add U-Shape Table
            </Button>
            <Button
              variant={addMode === "chair" ? "default" : "outline"}
              onClick={() => setAddMode(addMode === "chair" ? null : "chair")}
            >
              <Armchair className="w-4 h-4 mr-2" /> Add Chair
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmCopy(true)}
              disabled={copying}
              title={`Replace this layout with a copy of the ${otherScopeLabel} floor plan`}
            >
              <Copy className="w-4 h-4 mr-2" /> Copy from {otherScopeLabel}
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmRenumber(true)}
              disabled={renumbering || !(tables && tables.length > 0)}
              title="Relabel every table T1, T2, T3 …"
            >
              <ListOrdered className="w-4 h-4 mr-2" /> Renumber Tables
            </Button>
            <Button variant="destructive" disabled={!selected} onClick={handleRemove}>
              <Trash2 className="w-4 h-4 mr-2" /> Remove
            </Button>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
            View only — admin access required to edit
          </span>
        )}
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-4 rounded border border-gray-700 bg-white/80" /> Square table
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-3 bg-white/80 border border-gray-700" style={{ borderRadius: "10px 10px 0 0", borderBottom: "none" }} /> U-Shape table
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-2.5 bg-gray-800" style={{ borderRadius: "8px 8px 0 0" }} /> Chair
        </span>
        {addMode && (
          <span className="ml-auto bg-muted px-2 py-0.5 rounded-full">
            Click floor to place {addMode === "square" ? "square table" : addMode === "crescent" ? "U-shape table" : "chair"} · Esc to cancel
          </span>
        )}
        {selected && !addMode && (
          <span className="ml-auto">
            {selected.type === "table" ? "Double-click to rename" : "Chair selected"} · Click ↻ to rotate · Remove to delete
          </span>
        )}
      </div>

      {/* ── Floor plan + Table sales legend ── */}
      <div className="flex gap-3 items-start flex-col lg:flex-row">
      <div
        ref={containerRef}
        className={`flex-1 min-w-0 w-full overflow-hidden border rounded-xl relative bg-neutral-200 ${addMode ? "cursor-crosshair" : ""}`}
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
            const w    = ov?.w ?? Number(table.width);
            const h    = ov?.h ?? Number(table.height);
            const sel  = selected?.type === "table" && selected.id === table.id;
            const shape = (table as any).shape as TableShape ?? "square";
            const rot   = normalizeRot(ov?.r ?? (table as any).rotation ?? 0);
            const tgt: DragTarget = { type: "table", id: table.id };

            return (
              <div
                key={table.id}
                className="absolute cursor-grab active:cursor-grabbing"
                style={{
                  left: x, top: y, width: w, height: h,
                  userSelect: "none", touchAction: "none",
                  transform: `rotate(${rot}deg)`,
                  transformOrigin: "center center",
                }}
                onMouseDown={e => handleMouseDown(e, tgt, x, y)}
                onTouchStart={e => handleTouchStart(e, tgt, x, y)}
                onDoubleClick={e => { e.stopPropagation(); setEditingId(table.id); setEditingLabel(table.label); }}
              >
                {shape === "crescent"
                  ? <UShapeTableShape w={w} h={h} selected={sel} />
                  : <SquareTableShape w={w} h={h} selected={sel} />}

                {/* Resize handles */}
                {sel && isAdmin && (
                  <>
                    <ResizeHandle pos="se"
                      onMouseDown={e => handleResizeMouseDown(e, tgt, "se", w, h)}
                      onTouchStart={e => handleResizeTouchStart(e, tgt, "se", w, h)} />
                    <ResizeHandle pos="e"
                      onMouseDown={e => handleResizeMouseDown(e, tgt, "e", w, h)}
                      onTouchStart={e => handleResizeTouchStart(e, tgt, "e", w, h)} />
                    <ResizeHandle pos="s"
                      onMouseDown={e => handleResizeMouseDown(e, tgt, "s", w, h)}
                      onTouchStart={e => handleResizeTouchStart(e, tgt, "s", w, h)} />
                  </>
                )}

                {/* Rotate handle */}
                {sel && isAdmin && (
                  <RotateHandle
                    onClick={() => void rotateSelected(tgt, rot)}
                  />
                )}

                {/* Label overlay — kept upright regardless of rotation */}
                {editingId === table.id ? (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ transform: `rotate(${-rot}deg)` }}
                  >
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
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                    style={{ transform: `rotate(${-rot}deg)` }}
                  >
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
            const cw  = Number(chair.width)  || 18;
            const ch  = Number(chair.height) || 11;
            const rot = normalizeRot(chair.rotation ?? 0);
            const tgt: DragTarget = { type: "chair", id: chair.id };
            return (
              <div
                key={chair.id}
                className="absolute cursor-grab active:cursor-grabbing"
                style={{
                  left: Number(chair.x) - cw / 2, top: Number(chair.y) - ch / 2,
                  width: cw, height: ch,
                  userSelect: "none", touchAction: "none",
                  transform: `rotate(${rot}deg)`,
                  transformOrigin: "center center",
                }}
                onMouseDown={e => handleMouseDown(e, tgt, Number(chair.x), Number(chair.y))}
                onTouchStart={e => handleTouchStart(e, tgt, Number(chair.x), Number(chair.y))}
              >
                <ChairShape w={cw} h={ch} selected={sel} />
                {sel && isAdmin && (
                  <>
                    <ResizeHandle pos="se"
                      onMouseDown={e => handleResizeMouseDown(e, tgt, "se", cw, ch)}
                      onTouchStart={e => handleResizeTouchStart(e, tgt, "se", cw, ch)} />
                    <RotateHandle onClick={() => void rotateSelected(tgt, rot)} />
                  </>
                )}
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

      <TableLegend
        venueId={activeVenue?.id ?? ""}
        scope={scope}
        tables={(tables ?? []).map((t) => ({
          id: t.id,
          label: t.label,
          price: t.price ?? null,
          purchaserName: t.purchaserName ?? null,
        }))}
        isAdmin={isAdmin}
      />
      </div>

      <AlertDialog open={confirmCopy} onOpenChange={(v) => { if (!copying) setConfirmCopy(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy {otherScopeLabel} floor plan here?</AlertDialogTitle>
            <AlertDialogDescription>
              This wipes the current {scope === "restaurant" ? "Restaurant" : "Nightlife"} floor plan and replaces it
              with an exact copy of the {otherScopeLabel} layout — same table positions, sizes, shapes, and chairs.
              Sales data (price + purchaser) is NOT carried over; the copy starts unsold.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={copying}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleCopyFromOther()} disabled={copying}>
              {copying ? "Copying…" : `Copy from ${otherScopeLabel}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRenumber} onOpenChange={(v) => { if (!renumbering) setConfirmRenumber(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renumber every table?</AlertDialogTitle>
            <AlertDialogDescription>
              This relabels all {tables?.length ?? 0} tables in numerical order to T1, T2, T3, …
              Existing labels (including any custom names like "BAR" or "VIP") will be overwritten.
              Reservations and shifts are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={renumbering}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRenumber()} disabled={renumbering}>
              {renumbering ? "Renumbering…" : "Renumber"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
