import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type LiteratureCategory = "sop" | "cheat_sheet" | "training" | "policy" | "other";

export const LITERATURE_CATEGORY_LABELS: Record<LiteratureCategory, string> = {
  sop: "SOP",
  cheat_sheet: "Cheat Sheet",
  training: "Training",
  policy: "Policy",
  other: "Other",
};

export interface LiteratureDoc {
  id: string;
  venueId: string;
  title: string;
  description: string | null;
  category: LiteratureCategory;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: string | null;
  createdAt: string;
}

const literatureKey = (venueId: string) => ["literature", venueId] as const;

export function useLiterature(venueId: string) {
  return useQuery({
    queryKey: literatureKey(venueId),
    enabled: !!venueId,
    queryFn: async (): Promise<LiteratureDoc[]> => {
      const res = await fetch(`/api/literature?venueId=${encodeURIComponent(venueId)}`);
      if (!res.ok) throw new Error(`Failed to list literature (${res.status})`);
      return res.json();
    },
  });
}

export interface UploadLiteratureInput {
  venueId: string;
  title: string;
  category: LiteratureCategory;
  description?: string;
  uploadedByUserId?: string;
  file: File;
}

export function useUploadLiterature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UploadLiteratureInput): Promise<LiteratureDoc> => {
      const params = new URLSearchParams({
        venueId: input.venueId,
        title: input.title,
        category: input.category,
        fileName: input.file.name,
        mimeType: input.file.type || "application/octet-stream",
      });
      if (input.description) params.set("description", input.description);
      if (input.uploadedByUserId) params.set("uploadedByUserId", input.uploadedByUserId);
      const buffer = await input.file.arrayBuffer();
      const res = await fetch(`/api/literature?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: buffer,
      });
      if (!res.ok) {
        let message = `Upload failed (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) message = body.message;
        } catch { /* ignore */ }
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: (_doc, input) => {
      qc.invalidateQueries({ queryKey: literatureKey(input.venueId) });
    },
  });
}

export function useDeleteLiterature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; venueId: string }): Promise<void> => {
      const res = await fetch(`/api/literature/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: literatureKey(vars.venueId) });
    },
  });
}

export function literatureDownloadUrl(id: string): string {
  return `/api/literature/${id}/download`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
