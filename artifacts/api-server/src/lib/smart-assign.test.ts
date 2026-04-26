import { test } from "node:test";
import assert from "node:assert/strict";
import {
  suggestTables,
  buildServerLoadMap,
  type CandidateTable,
  type ConflictingReservation,
  type SectionInfo,
  type SuggestionInput,
} from "./smart-assign";

// ── Fixtures ─────────────────────────────────────────────────────────────────
const sectionA: SectionInfo = { id: "sec-A", name: "Section A", assignedUserId: "user-sarah" };
const sectionB: SectionInfo = { id: "sec-B", name: "Section B", assignedUserId: "user-mike" };

function makeTable(over: Partial<CandidateTable>): CandidateTable {
  return {
    id: "t1", label: "T1", capacity: 4, sectionId: sectionA.id, status: "available",
    ...over,
  };
}

const baseInput: SuggestionInput = {
  partySize: 4,
  date: "2026-04-26",
  time: "19:00",
  durationMinutes: 90,
};

// ── Tests ────────────────────────────────────────────────────────────────────

test("exact-capacity table beats a larger table", () => {
  const tables = [
    makeTable({ id: "t-large", label: "T-large", capacity: 8 }),
    makeTable({ id: "t-exact", label: "T-exact", capacity: 4 }),
  ];
  const suggestions = suggestTables(baseInput, tables, [], [sectionA, sectionB], new Map());
  assert.equal(suggestions[0].tableId, "t-exact",
    "table that exactly fits the party should be top-ranked");
  assert.ok(
    suggestions[0].reasons.some((r) => r.includes("Exact capacity")),
    "the winning suggestion should explain why",
  );
});

test("undersized tables are filtered out entirely", () => {
  const tables = [
    makeTable({ id: "t-small", capacity: 2 }),  // can't fit a party of 4
    makeTable({ id: "t-fits", capacity: 4 }),
  ];
  const suggestions = suggestTables(baseInput, tables, [], [sectionA, sectionB], new Map());
  assert.equal(suggestions.length, 1, "undersized table must be dropped");
  assert.equal(suggestions[0].tableId, "t-fits");
});

test("blocked tables are filtered out entirely", () => {
  const tables = [makeTable({ id: "t-blocked", status: "blocked" })];
  const suggestions = suggestTables(baseInput, tables, [], [sectionA, sectionB], new Map());
  assert.equal(suggestions.length, 0, "blocked table must never be suggested");
});

test("a conflicting active reservation removes the table from the pool", () => {
  const tables = [
    makeTable({ id: "t-conflict", capacity: 4 }),
    makeTable({ id: "t-clear", capacity: 4 }),
  ];
  // Existing reservation on t-conflict that overlaps the requested 19:00-20:30 window.
  const existingRes: ConflictingReservation = {
    tableId: "t-conflict",
    date: "2026-04-26",
    time: "19:30",
    durationMinutes: 90,
    status: "confirmed",
  };
  const suggestions = suggestTables(baseInput, tables, [existingRes], [sectionA, sectionB], new Map());
  assert.equal(suggestions.length, 1, "conflict should remove the table");
  assert.equal(suggestions[0].tableId, "t-clear");
});

test("cancelled and no-show reservations don't conflict", () => {
  const tables = [makeTable({ id: "t1", capacity: 4 })];
  const ghosts: ConflictingReservation[] = [
    { tableId: "t1", date: "2026-04-26", time: "19:00", durationMinutes: 90, status: "cancelled" },
    { tableId: "t1", date: "2026-04-26", time: "19:00", durationMinutes: 90, status: "no_show" },
    { tableId: "t1", date: "2026-04-26", time: "19:00", durationMinutes: 90, status: "completed" },
  ];
  const suggestions = suggestTables(baseInput, tables, ghosts, [sectionA, sectionB], new Map());
  assert.equal(suggestions.length, 1, "non-active statuses must not block the table");
});

test("light server scores higher than heavy server", () => {
  const tables = [
    makeTable({ id: "t-light", sectionId: sectionA.id, capacity: 4 }),  // sarah, light
    makeTable({ id: "t-heavy", sectionId: sectionB.id, capacity: 4 }),  // mike, heavy
  ];
  const load = new Map([
    ["user-sarah", 4],   // light
    ["user-mike", 16],   // overloaded
  ]);
  const suggestions = suggestTables(baseInput, tables, [], [sectionA, sectionB], load);
  assert.equal(suggestions[0].tableId, "t-light",
    "table in the lighter section should rank above the heavy one");
});

test("dirty tables are penalized but still suggested", () => {
  const tables = [
    makeTable({ id: "t-dirty", status: "dirty", capacity: 4 }),
    makeTable({ id: "t-clean", capacity: 6 }),  // larger capacity = lower base score
  ];
  const suggestions = suggestTables(baseInput, tables, [], [sectionA, sectionB], new Map());
  assert.equal(suggestions.length, 2, "dirty table is still in the pool");
  // t-clean has a 6-top penalty but t-dirty has the cleaning penalty.
  // Both should still be present; ranking depends on scoring tuning.
  assert.ok(
    suggestions.find((s) => s.tableId === "t-dirty")?.reasons.some((r) => r.includes("cleaned")),
    "dirty table reason should mention cleaning",
  );
});

test("preferred section gets a boost", () => {
  const tables = [
    makeTable({ id: "t-pref", sectionId: sectionA.id, capacity: 6 }),   // larger but preferred
    makeTable({ id: "t-other", sectionId: sectionB.id, capacity: 4 }),  // exact size, not preferred
  ];
  const suggestions = suggestTables(
    { ...baseInput, preferredSectionId: sectionA.id },
    tables, [], [sectionA, sectionB], new Map(),
  );
  // t-other has +0.4 (exact size), t-pref has +0.05 (larger) +0.15 (preferred) = +0.20.
  // Capacity match still wins — that's the dominant signal — so t-other ranks first.
  // What we want to verify: the preferred-section reason is surfaced.
  const prefSugg = suggestions.find((s) => s.tableId === "t-pref");
  assert.ok(prefSugg, "preferred table should still be suggested");
  assert.ok(
    prefSugg!.reasons.some((r) => r.includes("preferred section")),
    "preferred-section reason must be shown",
  );
});

test("buildServerLoadMap aggregates seated covers per server", () => {
  const tables = [
    { id: "t1", sectionId: sectionA.id },
    { id: "t2", sectionId: sectionA.id },
    { id: "t3", sectionId: sectionB.id },
  ];
  const seated = [
    { partySize: 2, tableId: "t1" },
    { partySize: 4, tableId: "t2" },
    { partySize: 3, tableId: "t3" },
    { partySize: 6, tableId: null },           // unassigned — ignored
  ];
  const load = buildServerLoadMap(seated, tables, [sectionA, sectionB]);
  assert.equal(load.get("user-sarah"), 6, "sarah covers two tables (2 + 4)");
  assert.equal(load.get("user-mike"), 3, "mike covers one table");
});
