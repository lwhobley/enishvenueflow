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
import { Plus, Trash2, SquarePlus } from "lucide-react";
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

export default function ManagerFloor() {
  const { activeVenue } = useAppContext();
  const queryClient = useQueryClient();

  const [chairs, setChairs] = useState<ChairRecord[]>([]);
  const [selected, setSelected] = useState<DragTarget | null>(null);
  const [addMode, setAddMode] = useState<"table" | "chair" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [tableOverrides, setTableOverrides] = useState<Record<string, { x: number; y: number }>>({});

  const dragRef = useRef<{
    target: DragTarget;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

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

  const tablesQueryKey = getListTablesQueryKey({ venueId: activeVenue?.id || "" });

  useEffect(() => {
    if (!activeVenue?.id) return;
    apiFetch(`/chairs?venueId=${activeVenue.id}`)
      .then((data) => setChairs(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [activeVenue?.id]);

  const handleCanvasClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!addMode || !activeVenue?.id || !canvasRef.current) return;
      if ((e.target as HTMLElement) !== canvasRef.current && !(e.target as HTMLElement).classList.contains("floor-bg")) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

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
        const nextNum = (tables?.length ?? 0) + 1;
        await createTableMut.mutateAsync({
          data: {
            venueId: activeVenue.id,
            sectionId: section.id,
            label: `T${nextNum}`,
            capacity: 4,
            x: String(x),
            y: String(y),
            width: "80",
            height: "80",
          },
        });
        queryClient.invalidateQueries({ queryKey: tablesQueryKey });
        setAddMode(null);
      }
    },
    [addMode, activeVenue?.id, sections, tables?.length, createTableMut, queryClient, tablesQueryKey]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, target: DragTarget, origX: number, origY: number) => {
      e.stopPropagation();
      e.preventDefault();
      setSelected(target);
      dragRef.current = { target, startX: e.clientX, startY: e.clientY, origX, origY };
    },
    []
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newX = Math.max(0, dragRef.current.origX + dx);
    const newY = Math.max(0, dragRef.current.origY + dy);

    if (dragRef.current.target.type === "chair") {
      setChairs((prev) =>
        prev.map((c) => (c.id === dragRef.current!.target.id ? { ...c, x: newX, y: newY } : c))
      );
    } else if (dragRef.current.target.type === "table") {
      setTableOverrides((prev) => ({ ...prev, [dragRef.current!.target.id]: { x: newX, y: newY } }));
    }
  }, []);

  const handleMouseUp = useCallback(async () => {
    if (!dragRef.current) return;
    const { target } = dragRef.current;

    if (target.type === "chair") {
      const chair = chairs.find((c) => c.id === target.id);
      if (chair) {
        await apiFetch(`/chairs/${target.id}`, {
          method: "PUT",
          body: JSON.stringify({ x: chair.x, y: chair.y }),
        });
      }
    } else if (target.type === "table") {
      const override = tableOverrides[target.id];
      if (override) {
        await updateTable.mutateAsync({ id: target.id, data: { x: override.x, y: override.y } });
        queryClient.invalidateQueries({ queryKey: tablesQueryKey });
      }
    }
    dragRef.current = null;
  }, [chairs, tableOverrides, updateTable, queryClient, tablesQueryKey]);

  const handleRemoveSelected = useCallback(async () => {
    if (!selected || !activeVenue?.id) return;
    if (selected.type === "table") {
      await deleteTableMut.mutateAsync({ id: selected.id });
      queryClient.invalidateQueries({ queryKey: tablesQueryKey });
      setTableOverrides((prev) => { const n = { ...prev }; delete n[selected.id]; return n; });
    } else {
      await apiFetch(`/chairs/${selected.id}`, { method: "DELETE" });
      setChairs((prev) => prev.filter((c) => c.id !== selected.id));
    }
    setSelected(null);
  }, [selected, deleteTableMut, queryClient, tablesQueryKey, activeVenue?.id]);

  const startEditing = useCallback((id: string, label: string) => {
    setEditingId(id);
    setEditingLabel(label);
  }, []);

  const saveLabel = useCallback(async () => {
    if (!editingId || !editingLabel.trim()) { setEditingId(null); return; }
    await updateTable.mutateAsync({ id: editingId, data: { label: editingLabel.trim() } });
    queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    setEditingId(null);
  }, [editingId, editingLabel, updateTable, queryClient, tablesQueryKey]);

  const statusColor: Record<string, string> = {
    available: "#22c55e",
    occupied:  "#ef4444",
    reserved:  "#eab308",
    cleaning:  "#6b7280",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Floor Plan</h1>
        <div className="flex gap-2 flex-wrap">
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
          <Button variant="destructive" disabled={!selected} onClick={handleRemoveSelected}>
            <Trash2 className="w-4 h-4 mr-2" /> Remove
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm items-center">
        {[["bg-green-500", "Available"], ["bg-red-500", "Occupied"], ["bg-yellow-500", "Reserved"], ["bg-gray-500", "Cleaning"]].map(([cls, label]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${cls}`} />
            {label}
          </div>
        ))}
        {addMode && (
          <span className="ml-auto text-xs bg-muted px-3 py-1 rounded-full text-muted-foreground">
            Click floor to place {addMode} · press Esc to cancel
          </span>
        )}
        {selected && !addMode && (
          <span className="ml-auto text-xs text-muted-foreground">
            {selected.type === "table" ? "Double-click table to edit number" : "Chair selected"} · Remove button to delete
          </span>
        )}
      </div>

      <div
        ref={canvasRef}
        className={`relative w-full h-[680px] border rounded-xl overflow-hidden select-none ${addMode ? "cursor-crosshair" : "cursor-default"}`}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        onKeyDown={(e) => { if (e.key === "Escape") setAddMode(null); }}
        tabIndex={0}
      >
        <img
          src={floorPlanBg}
          alt="Venue floor plan"
          className="floor-bg absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none"
          draggable={false}
        />

        {tables?.map((table) => {
          const override = tableOverrides[table.id];
          const x = override?.x ?? Number(table.x);
          const y = override?.y ?? Number(table.y);
          const isSelected = selected?.type === "table" && selected.id === table.id;
          const isEditing = editingId === table.id;
          const bg = statusColor[table.status] ?? "#6b7280";

          return (
            <div
              key={table.id}
              className={`absolute flex flex-col items-center justify-center rounded-lg shadow-lg cursor-grab active:cursor-grabbing ${isSelected ? "ring-2 ring-white ring-offset-1 shadow-2xl" : ""}`}
              style={{
                left: x,
                top: y,
                width: Number(table.width),
                height: Number(table.height),
                backgroundColor: bg,
                userSelect: "none",
              }}
              onMouseDown={(e) => handleMouseDown(e, { type: "table", id: table.id }, x, y)}
              onDoubleClick={(e) => { e.stopPropagation(); startEditing(table.id, table.label); }}
            >
              {isEditing ? (
                <Input
                  autoFocus
                  className="w-[90%] text-center text-sm font-bold bg-white/20 border-white/60 text-white placeholder:text-white/60 h-7 px-1"
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
                <span className="text-white font-bold text-sm leading-tight px-1 text-center">
                  {table.label}
                </span>
              )}
              <span className="text-white/70 text-[10px]">{table.capacity}p</span>
            </div>
          );
        })}

        {chairs.map((chair) => {
          const isSelected = selected?.type === "chair" && selected.id === chair.id;
          return (
            <div
              key={chair.id}
              className={`absolute rounded-full cursor-grab active:cursor-grabbing shadow ${isSelected ? "ring-2 ring-white ring-offset-1" : ""}`}
              style={{
                left: Number(chair.x) - 13,
                top: Number(chair.y) - 13,
                width: 26,
                height: 26,
                backgroundColor: "#78716c",
                border: "2px solid #57534e",
                userSelect: "none",
              }}
              onMouseDown={(e) => handleMouseDown(e, { type: "chair", id: chair.id }, Number(chair.x), Number(chair.y))}
            />
          );
        })}

        {!tables?.length && !chairs.length && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <p>No tables or chairs yet.</p>
            <p className="text-sm">Use the toolbar above to add them to the floor plan.</p>
          </div>
        )}
      </div>
    </div>
  );
}
