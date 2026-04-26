import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Check, X } from "lucide-react";

export interface SectionRow {
  id: string;
  name: string;
  color: string;
  capacity: number;
  assignedUserId: string | null;
}

export interface SectionUser {
  id: string;
  fullName: string;
}

const UNASSIGNED = "__unassigned__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  scope: "restaurant" | "nightlife";
  sections: SectionRow[];
  users: SectionUser[];
  // Query keys to invalidate after a mutation so the floor plan refreshes.
  sectionsQueryKey: readonly unknown[];
  tablesQueryKey: readonly unknown[];
}

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#64748b", // slate
];

export function SectionsDialog({
  open, onOpenChange, venueId, scope, sections, users, sectionsQueryKey, tablesQueryKey,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const sortedUsers = [...users].sort((a, b) => a.fullName.localeCompare(b.fullName));

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [newAssignee, setNewAssignee] = useState<string>(UNASSIGNED);
  const [creating, setCreating] = useState(false);

  // Per-row in-flight assignee writes so individual rows can show a spinner.
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: sectionsQueryKey }),
      qc.invalidateQueries({ queryKey: tablesQueryKey }),
    ]);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ title: "Section name required", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/floor-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId, name, color: newColor, capacity: 0, scope,
          assignedUserId: newAssignee === UNASSIGNED ? null : newAssignee,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `Create failed (${res.status})`);
      }
      await refresh();
      setNewName("");
      setNewColor(PRESET_COLORS[0]);
      setNewAssignee(UNASSIGNED);
      toast({ title: "Section created", description: name });
    } catch (err) {
      toast({
        title: "Failed to create section",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const assignUser = async (sectionId: string, userId: string) => {
    setAssigningId(sectionId);
    try {
      const res = await fetch(`/api/floor-sections/${sectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedUserId: userId === UNASSIGNED ? null : userId }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `Save failed (${res.status})`);
      }
      await refresh();
    } catch (err) {
      toast({
        title: "Failed to assign",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setAssigningId(null);
    }
  };

  const startEdit = (s: SectionRow) => {
    setEditingId(s.id);
    setEditingName(s.name);
    setEditingColor(s.color);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditingColor("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) {
      toast({ title: "Section name required", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/floor-sections/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: editingColor }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `Save failed (${res.status})`);
      }
      await refresh();
      cancelEdit();
      toast({ title: "Section updated" });
    } catch (err) {
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/floor-sections/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `Delete failed (${res.status})`);
      }
      await refresh();
      toast({ title: "Section deleted", description: name });
    } catch (err) {
      toast({
        title: "Couldn't delete section",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Manage sections</DialogTitle>
          <DialogDescription>
            Group tables under named sections (e.g. Patio, Bar, VIP). New tables
            are added to the section currently selected in the toolbar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              New section
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Section 1, Bar A, VIP"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              />
              <Button onClick={() => void handleCreate()} disabled={creating || !newName.trim()}>
                {creating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
                Add
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Assign to</Label>
              <Select value={newAssignee} onValueChange={setNewAssignee}>
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {sortedUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ColorRow value={newColor} onChange={setNewColor} />
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Existing sections
            </div>
            {sections.length === 0 ? (
              <div className="text-sm text-muted-foreground border rounded-md px-3 py-4 text-center">
                No sections yet. Create one above.
              </div>
            ) : (
              <ul className="border rounded-md divide-y">
                {sections.map((s) => {
                  const isEditing = editingId === s.id;
                  const isDeleting = deletingId === s.id;
                  const isAssigning = assigningId === s.id;
                  return (
                    <li key={s.id} className="px-3 py-2.5 text-sm space-y-2">
                      <div className="flex items-center gap-3">
                      <span
                        className="inline-block w-4 h-4 rounded-full border flex-shrink-0"
                        style={{ backgroundColor: isEditing ? editingColor : s.color }}
                      />
                      {isEditing ? (
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveEdit();
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="flex-1"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 font-medium">{s.name}</span>
                      )}
                      {isEditing ? (
                        <>
                          <Button type="button" size="sm" variant="ghost" onClick={cancelEdit} disabled={savingEdit} aria-label="Cancel">
                            <X className="w-4 h-4" />
                          </Button>
                          <Button type="button" size="sm" onClick={() => void saveEdit()} disabled={savingEdit}>
                            {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(s)} disabled={isDeleting} aria-label="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => void handleDelete(s.id, s.name)} disabled={isDeleting} aria-label="Delete">
                            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </Button>
                        </>
                      )}
                      </div>
                      <div className="flex items-center gap-2 pl-7">
                        <Label className="text-xs text-muted-foreground w-20">Assigned to</Label>
                        <Select
                          value={s.assignedUserId ?? UNASSIGNED}
                          onValueChange={(v) => void assignUser(s.id, v)}
                        >
                          <SelectTrigger className="h-8 flex-1">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                            {sortedUsers.map((u) => (
                              <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isAssigning ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {editingId ? (
              <div className="mt-2 px-1">
                <ColorRow value={editingColor} onChange={setEditingColor} />
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColorRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground">Color</Label>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={c}
            className={`w-6 h-6 rounded-full border-2 transition-transform ${
              value === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}
