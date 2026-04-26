/**
 * Smart table-assignment scoring. Pure function so it can be unit tested
 * without a DB or HTTP surface. The route handler (in routes/reservations.ts)
 * loads the inputs once and calls suggestTables(); the host-stand panel
 * displays the ranked list with the human-readable `reasons[]`.
 *
 * Scoring is intentionally explainable — every reason that influenced a
 * score is appended to `reasons[]`, so a host can always see "why this
 * table" instead of trusting an opaque sort.
 */

export interface SuggestionInput {
  partySize: number;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM (24-hour)
  durationMinutes: number;
  /** Optional — boosts tables in this section if set (e.g. VIP request). */
  preferredSectionId?: string | null;
}

export interface CandidateTable {
  id: string;
  label: string;
  capacity: number;
  sectionId: string | null;
  /** Current status — used to filter out blocked and to penalize dirty. */
  status: string;
}

export interface SectionInfo {
  id: string;
  name: string;
  assignedUserId: string | null;
}

export interface ConflictingReservation {
  /** May be null for unassigned reservations — those don't block any table. */
  tableId: string | null;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  durationMinutes: number;
  status: string;
}

export interface TableSuggestion {
  tableId: string;
  label: string;
  /** 0..1, higher = better. */
  score: number;
  reasons: string[];
}

/** Statuses we consider "still occupying the table at time T". */
const ACTIVE_STATUSES = new Set(["pending", "confirmed", "arrived", "seated"]);

/** Combines a YYYY-MM-DD + HH:MM (local) into an epoch ms count. */
function toMs(date: string, time: string): number {
  return new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`).getTime();
}

/**
 * Returns ranked table suggestions for a reservation, best first.
 * Hard filters: blocked tables, undersized tables, time conflicts.
 * Soft scoring: capacity match + server load balance + preferred section
 *               + a small dirty-table penalty.
 */
export function suggestTables(
  input: SuggestionInput,
  tables: CandidateTable[],
  reservations: ConflictingReservation[],
  sections: SectionInfo[],
  /** userId → number of currently-seated covers in their section. */
  serverLoadByUserId: Map<string, number>,
): TableSuggestion[] {
  const reqStartMs = toMs(input.date, input.time);
  const reqEndMs = reqStartMs + input.durationMinutes * 60_000;

  return tables
    .map((table): TableSuggestion | null => {
      // ── Hard filters ─────────────────────────────────────────────
      if (table.status === "blocked") return null;
      if (table.capacity < input.partySize) return null;

      const conflicts = reservations.filter((r) => {
        if (r.tableId !== table.id) return false;
        if (!ACTIVE_STATUSES.has(r.status)) return false;
        const startMs = toMs(r.date, r.time);
        const endMs = startMs + (r.durationMinutes ?? 90) * 60_000;
        // Two intervals overlap iff each starts before the other ends.
        return startMs < reqEndMs && endMs > reqStartMs;
      });
      if (conflicts.length > 0) return null;

      // ── Soft scoring ─────────────────────────────────────────────
      const reasons: string[] = [];
      let score = 0.5;

      // Capacity match — 0.40 weight, the dominant signal.
      const capDiff = table.capacity - input.partySize;
      if (capDiff === 0) {
        score += 0.4;
        reasons.push(`Exact capacity for ${input.partySize}`);
      } else if (capDiff <= 2) {
        score += 0.25;
        reasons.push(`Seats ${table.capacity}, party of ${input.partySize}`);
      } else {
        score += 0.05;
        reasons.push(`${table.capacity}-top — larger than needed`);
      }

      // Server load balance — 0.20 weight.
      const section = sections.find((s) => s.id === table.sectionId);
      if (section?.assignedUserId) {
        const covers = serverLoadByUserId.get(section.assignedUserId) ?? 0;
        if (covers <= 6) {
          score += 0.2;
          reasons.push(`${section.name} is light on covers`);
        } else if (covers <= 12) {
          score += 0.1;
          reasons.push(`${section.name} is balanced`);
        } else {
          reasons.push(`${section.name} is busy (${covers} covers)`);
        }
      } else {
        reasons.push("Section unassigned");
      }

      // Preferred section — 0.15 weight.
      if (input.preferredSectionId && table.sectionId === input.preferredSectionId) {
        score += 0.15;
        reasons.push("Matches preferred section");
      }

      // Dirty penalty — small. Doesn't disqualify (host may still want
      // to bus + seat) but ranks the table below clean alternatives.
      if (table.status === "dirty") {
        score -= 0.1;
        reasons.push("Currently being cleaned");
      }

      return {
        tableId: table.id,
        label: table.label,
        score: Math.max(0, Math.min(1, score)),
        reasons,
      };
    })
    .filter((s): s is TableSuggestion => s !== null)
    // Higher score first; tie-breaker: smaller capacity (less waste).
    .sort((a, b) => b.score - a.score);
}

/**
 * Helper — given the set of seated reservations, build the
 * userId → covers Map smart-assign expects. Used by the route handler.
 */
export function buildServerLoadMap(
  seatedReservations: Array<{ partySize: number; tableId: string | null }>,
  tables: Array<{ id: string; sectionId: string | null }>,
  sections: SectionInfo[],
): Map<string, number> {
  const tableSection = new Map(tables.map((t) => [t.id, t.sectionId]));
  const sectionUser = new Map(sections.map((s) => [s.id, s.assignedUserId]));
  const load = new Map<string, number>();
  for (const r of seatedReservations) {
    if (!r.tableId) continue;
    const sId = tableSection.get(r.tableId);
    if (!sId) continue;
    const userId = sectionUser.get(sId);
    if (!userId) continue;
    load.set(userId, (load.get(userId) ?? 0) + r.partySize);
  }
  return load;
}
