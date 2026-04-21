import { Router, type IRouter, json, raw, urlencoded } from "express";
import { db, literature, LITERATURE_CATEGORIES, type LiteratureCategory } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const router: IRouter = Router();

function serialize(row: typeof literature.$inferSelect) {
  return {
    id: row.id,
    venueId: row.venueId,
    title: row.title,
    description: row.description,
    category: row.category,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedByUserId: row.uploadedByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

function isValidCategory(value: unknown): value is LiteratureCategory {
  return typeof value === "string" && (LITERATURE_CATEGORIES as readonly string[]).includes(value);
}

router.get("/literature", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const rows = await db
      .select({
        id: literature.id,
        venueId: literature.venueId,
        title: literature.title,
        description: literature.description,
        category: literature.category,
        fileName: literature.fileName,
        mimeType: literature.mimeType,
        sizeBytes: literature.sizeBytes,
        uploadedByUserId: literature.uploadedByUserId,
        createdAt: literature.createdAt,
      })
      .from(literature)
      .where(eq(literature.venueId, venueId))
      .orderBy(desc(literature.createdAt));
    res.json(rows.map((r) => ({ ...serialize(r as typeof literature.$inferSelect) })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list literature" });
  }
});

// Upload: POST /literature with binary body (Content-Type: application/octet-stream)
// and metadata as query params (venueId, title, category, description, fileName,
// mimeType, uploadedByUserId). Keeps parsing dependency-free.
router.post(
  "/literature",
  raw({ type: "application/octet-stream", limit: MAX_UPLOAD_BYTES }),
  async (req, res) => {
    try {
      const {
        venueId,
        title,
        category = "other",
        description,
        fileName,
        mimeType,
        uploadedByUserId,
      } = req.query as Record<string, string | undefined>;

      if (!venueId) return res.status(400).json({ message: "venueId required" });
      if (!title) return res.status(400).json({ message: "title required" });
      if (!fileName) return res.status(400).json({ message: "fileName required" });
      if (!mimeType) return res.status(400).json({ message: "mimeType required" });
      if (!isValidCategory(category)) {
        return res.status(400).json({
          message: `category must be one of: ${LITERATURE_CATEGORIES.join(", ")}`,
        });
      }

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ message: "Empty upload body" });
      }
      if (body.length > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ message: "File too large" });
      }

      const [row] = await db
        .insert(literature)
        .values({
          venueId,
          title,
          description: description ?? null,
          category,
          fileName,
          mimeType,
          sizeBytes: body.length,
          fileData: body,
          uploadedByUserId: uploadedByUserId ?? null,
        })
        .returning();
      res.status(201).json(serialize(row));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ message: "Failed to upload literature" });
    }
  },
);

router.get("/literature/:id/download", async (req, res) => {
  try {
    const { id } = req.params;
    const [row] = await db.select().from(literature).where(eq(literature.id, id));
    if (!row) return res.status(404).json({ message: "Not found" });
    res.setHeader("Content-Type", row.mimeType);
    res.setHeader("Content-Length", String(row.sizeBytes));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(row.fileName)}"`,
    );
    res.send(row.fileData);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to download literature" });
  }
});

router.delete("/literature/:id", json(), urlencoded({ extended: true }), async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.delete(literature).where(eq(literature.id, id)).returning({
      id: literature.id,
    });
    if (deleted.length === 0) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to delete literature" });
  }
});

export default router;
