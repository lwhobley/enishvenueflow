import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAppContext } from "@/hooks/use-app-context";
import { useAuth } from "@/contexts/auth-context";
import {
  useLiterature,
  useUploadLiterature,
  useDeleteLiterature,
  literatureDownloadUrl,
  formatBytes,
  LITERATURE_CATEGORY_LABELS,
  type LiteratureCategory,
  type LiteratureDoc,
} from "@/lib/literature-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Download, Trash2, FileText, Loader2, Search, BookOpen,
} from "lucide-react";

const CATEGORY_ORDER: LiteratureCategory[] = ["sop", "cheat_sheet", "training", "policy", "other"];

const CATEGORY_TONES: Record<LiteratureCategory, { well: string; icon: string; ring: string }> = {
  sop:         { well: "linear-gradient(135deg, #F6E6B8 0%, #E9CF8A 100%)", icon: "#7A5F1F", ring: "rgba(178,136,47,0.25)" },
  cheat_sheet: { well: "linear-gradient(135deg, #FCE3BE 0%, #F1C88C 100%)", icon: "#8A5320", ring: "rgba(193,126,53,0.25)" },
  training:    { well: "linear-gradient(135deg, #DDE5CC 0%, #C1CFA5 100%)", icon: "#4E6630", ring: "rgba(108,138,78,0.25)" },
  policy:      { well: "linear-gradient(135deg, #E5D3DD 0%, #C9AFBE 100%)", icon: "#5E3344", ring: "rgba(121,84,100,0.25)" },
  other:       { well: "linear-gradient(135deg, #E4DDD1 0%, #CDC2AE 100%)", icon: "#2A1F17", ring: "rgba(42,31,23,0.22)" },
};

const L = {
  cream:     "#FFFDF7",
  parchment: "#F0E8D3",
  border:    "rgba(178,136,47,0.22)",
  gold:      "#B2882F",
  espresso:  "#2A1F17",
  taupe:     "rgba(42,31,23,0.56)",
};

export default function ManagerLiterature() {
  return <LiteraturePage canManage />;
}

// Shared component — also used by the employee page with canManage=false.
export function LiteraturePage({ canManage }: { canManage: boolean }) {
  const { activeVenue } = useAppContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const venueId = activeVenue?.id || "";

  const { data, isLoading } = useLiterature(venueId);
  const uploadMut = useUploadLiterature();
  const deleteMut = useDeleteLiterature();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LiteratureDoc | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LiteratureCategory | "all">("all");

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((d) => {
      if (filter !== "all" && d.category !== filter) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q) ||
        d.fileName.toLowerCase().includes(q)
      );
    });
  }, [data, search, filter]);

  const grouped = useMemo(() => {
    const g: Record<LiteratureCategory, LiteratureDoc[]> = {
      sop: [], cheat_sheet: [], training: [], policy: [], other: [],
    };
    for (const d of filtered) g[d.category]?.push(d);
    return g;
  }, [filtered]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const t = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteMut.mutateAsync({ id: t.id, venueId });
      toast({ title: "Removed", description: t.title });
    } catch (err) {
      toast({
        title: "Failed to delete",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 20,
          padding: "28px 32px",
          background: `linear-gradient(135deg, ${L.cream} 0%, ${L.parchment} 100%)`,
          border: `1px solid ${L.border}`,
          boxShadow: "0 1px 2px rgba(42,31,23,0.04), 0 12px 32px -18px rgba(42,31,23,0.14)",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -80, right: -60, width: 260, height: 260, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(217,184,103,0.35) 0%, rgba(217,184,103,0) 65%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: L.gold, fontWeight: 600 }}>
              Reference Library
            </div>
            <h1 style={{ marginTop: 8, marginBottom: 0, fontSize: 30, fontWeight: 600, letterSpacing: -0.5, color: L.espresso, lineHeight: 1.15 }}>
              Literature
            </h1>
            <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: L.taupe, maxWidth: 560 }}>
              SOPs, cheat sheets, training guides, and house policy — the reference shelf for your team.
            </p>
          </div>
          {canManage ? (
            <Button onClick={() => setUploadOpen(true)} size="lg">
              <Upload className="w-4 h-4 mr-2" />
              Upload document
            </Button>
          ) : null}
        </div>
      </motion.div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search titles, descriptions, filenames…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as LiteratureCategory | "all")}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORY_ORDER.map((c) => (
              <SelectItem key={c} value={c}>{LITERATURE_CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState canManage={canManage} onUpload={() => setUploadOpen(true)} />
      ) : (
        <div className="space-y-8">
          {CATEGORY_ORDER.map((category) => {
            const items = grouped[category];
            if (!items || items.length === 0) return null;
            return (
              <section key={category}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                }}>
                  <span style={{
                    fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase",
                    color: CATEGORY_TONES[category].icon, fontWeight: 700,
                  }}>
                    {LITERATURE_CATEGORY_LABELS[category]}
                  </span>
                  <span style={{ flex: 1, height: 1, background: L.border }} />
                  <span style={{ fontSize: 11, color: L.taupe }}>{items.length}</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {items.map((doc, i) => (
                    <LiteratureCard
                      key={doc.id}
                      doc={doc}
                      index={i}
                      canManage={canManage}
                      onDelete={() => setDeleteTarget(doc)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {canManage ? (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          venueId={venueId}
          uploadedByUserId={user?.id}
          onUploaded={() => setUploadOpen(false)}
          upload={uploadMut}
        />
      ) : null}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the file from the library. Staff will no longer be able to download it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ canManage, onUpload }: { canManage: boolean; onUpload: () => void }) {
  return (
    <div style={{
      borderRadius: 20,
      border: `1px dashed ${L.border}`,
      padding: "56px 24px",
      textAlign: "center",
      background: L.cream,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: CATEGORY_TONES.sop.well,
        boxShadow: `inset 0 0 0 1px ${CATEGORY_TONES.sop.ring}`,
      }}>
        <BookOpen size={22} color={CATEGORY_TONES.sop.icon} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: L.espresso }}>
        The library is empty
      </div>
      <p style={{ fontSize: 13, color: L.taupe, marginTop: 6, maxWidth: 420, margin: "6px auto 0" }}>
        {canManage
          ? "Upload your first SOP, cheat sheet, or training guide to start building the reference shelf."
          : "No documents have been shared yet. Ask a manager to upload the team's SOPs and cheat sheets."}
      </p>
      {canManage ? (
        <Button className="mt-4" onClick={onUpload}>
          <Upload className="w-4 h-4 mr-2" /> Upload the first document
        </Button>
      ) : null}
    </div>
  );
}

function LiteratureCard({
  doc, index, canManage, onDelete,
}: {
  doc: LiteratureDoc;
  index: number;
  canManage: boolean;
  onDelete: () => void;
}) {
  const tone = CATEGORY_TONES[doc.category];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2 }}
      style={{
        background: L.cream,
        border: `1px solid ${L.border}`,
        borderRadius: 16,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        boxShadow: "0 1px 2px rgba(42,31,23,0.04), 0 8px 24px -12px rgba(42,31,23,0.08)",
        transition: "box-shadow 0.25s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow =
          "0 2px 4px rgba(42,31,23,0.06), 0 16px 40px -16px rgba(42,31,23,0.18)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow =
          "0 1px 2px rgba(42,31,23,0.04), 0 8px 24px -12px rgba(42,31,23,0.08)";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: tone.well,
          boxShadow: `inset 0 0 0 1px ${tone.ring}`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <FileText size={18} color={tone.icon} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: L.espresso, lineHeight: 1.25, wordBreak: "break-word" }}>
            {doc.title}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: L.taupe, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all" }}>
            {doc.fileName} · {formatBytes(doc.sizeBytes)}
          </div>
        </div>
      </div>
      {doc.description ? (
        <p style={{ fontSize: 13, color: L.taupe, lineHeight: 1.45, margin: 0 }}>
          {doc.description}
        </p>
      ) : null}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingTop: 8, borderTop: `1px solid ${L.border}`,
      }}>
        <span style={{ fontSize: 11, color: L.taupe }}>
          {new Date(doc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a href={literatureDownloadUrl(doc.id)} target="_blank" rel="noreferrer" download={doc.fileName}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Download
            </a>
          </Button>
          {canManage ? (
            <Button variant="ghost" size="sm" onClick={onDelete} aria-label={`Delete ${doc.title}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

function UploadDialog({
  open, onOpenChange, venueId, uploadedByUserId, upload, onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  uploadedByUserId: string | undefined;
  upload: ReturnType<typeof useUploadLiterature>;
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<LiteratureCategory>("sop");
  const [description, setDescription] = useState("");

  const reset = () => {
    setFile(null);
    setTitle("");
    setCategory("sop");
    setDescription("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!file) {
      toast({ title: "Pick a file first", variant: "destructive" });
      return;
    }
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    try {
      await upload.mutateAsync({
        venueId,
        title: title.trim(),
        category,
        description: description.trim() || undefined,
        uploadedByUserId,
        file,
      });
      toast({ title: "Uploaded", description: file.name });
      reset();
      onUploaded();
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            Add an SOP, cheat sheet, or training guide. Up to 10 MB.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lit-file">File</Label>
            <Input
              id="lit-file"
              type="file"
              ref={fileInputRef}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }}
            />
            {file ? (
              <p className="text-xs text-muted-foreground">
                {file.name} · {formatBytes(file.size)}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lit-title">Title</Label>
            <Input
              id="lit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Opening Shift SOP"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lit-category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as LiteratureCategory)}>
              <SelectTrigger id="lit-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_ORDER.map((c) => (
                  <SelectItem key={c} value={c}>{LITERATURE_CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lit-desc">Description (optional)</Label>
            <Textarea
              id="lit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short note so staff know when to reference it."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={upload.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={upload.isPending || !file}>
            {upload.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" /> Upload</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
