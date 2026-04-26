import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoAssign,
  type OpenShiftInput,
  type UserInput,
  type AvailabilityInput,
} from "./auto-assign";

// ── Fixtures ────────────────────────────────────────────────────────────────
function user(over: Partial<UserInput> = {}): UserInput {
  return {
    id: "u1", fullName: "Alex Server", isActive: true,
    positions: ["server"], hourlyRate: 18,
    ...over,
  };
}

// Wednesday 2026-04-29 17:00 — 22:00. (DOW = 3.)
function shift(over: Partial<OpenShiftInput> = {}): OpenShiftInput {
  return {
    id: "s1", roleId: "r-server", roleName: "Server",
    startTime: new Date("2026-04-29T17:00:00"),
    endTime:   new Date("2026-04-29T22:00:00"),
    ...over,
  };
}

function avail(over: Partial<AvailabilityInput>): AvailabilityInput {
  return {
    userId: "u1", dayOfWeek: 3, isAvailable: true, startTime: null, endTime: null,
    ...over,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

test("filters out users without the role in their positions[]", () => {
  const u = user({ positions: ["host"] });    // not a server
  const result = autoAssign([shift()], [u], [], [], []);
  assert.equal(result[0].userId, null);
  assert.match(result[0].reasons[0], /not trained for Server/);
});

test("position match is case-insensitive", () => {
  const u = user({ positions: ["SERVER"] });  // uppercase
  const result = autoAssign([shift()], [u], [], [], []);
  assert.equal(result[0].userId, "u1");
});

test("filters out users on approved time-off covering the date", () => {
  const u = user();
  const result = autoAssign(
    [shift()], [u], [], [],
    [{ userId: "u1", startDate: "2026-04-28", endDate: "2026-04-30" }],
  );
  assert.equal(result[0].userId, null);
  assert.match(result[0].reasons[0], /time-off/);
});

test("filters out users marked unavailable on that day-of-week", () => {
  const u = user();
  const result = autoAssign(
    [shift()], [u], [],
    [avail({ isAvailable: false })],
    [],
  );
  assert.equal(result[0].userId, null);
  assert.match(result[0].reasons[0], /unavailable/);
});

test("filters out users whose availability window doesn't cover the shift", () => {
  // User available 09:00 - 16:00 on Wed; shift is 17:00 - 22:00.
  const u = user();
  const result = autoAssign(
    [shift()], [u], [],
    [avail({ startTime: "09:00", endTime: "16:00" })],
    [],
  );
  assert.equal(result[0].userId, null);
  assert.match(result[0].reasons[0], /outside availability/);
});

test("filters out users with overlapping existing shifts", () => {
  const u = user();
  const conflicting = {
    userId: "u1",
    startTime: new Date("2026-04-29T18:00:00"),  // overlaps the 17-22 shift
    endTime:   new Date("2026-04-29T23:00:00"),
  };
  const result = autoAssign([shift()], [u], [conflicting], [], []);
  assert.equal(result[0].userId, null);
  assert.match(result[0].reasons[0], /overlapping/);
});

test("blocks an assignment that would push the user past 40h/week", () => {
  const u = user();
  // Already 38h scheduled this week (Mon-Tue 19h each); shift is +5h.
  const existing = [
    { userId: "u1", startTime: new Date("2026-04-27T08:00:00"), endTime: new Date("2026-04-27T22:00:00") }, // 14h
    { userId: "u1", startTime: new Date("2026-04-28T08:00:00"), endTime: new Date("2026-04-29T00:00:00") }, // 16h
    { userId: "u1", startTime: new Date("2026-04-30T08:00:00"), endTime: new Date("2026-04-30T16:00:00") }, // 8h
    // total = 38h
  ];
  const result = autoAssign([shift()], [u], existing, [], []);
  assert.equal(result[0].userId, null);
  assert.match(result[0].reasons[0], /exceed 40h\/week/);
});

test("fairness: when two users are equally eligible, the one with fewer hours wins", () => {
  const a = user({ id: "u-light", fullName: "Alex Light" });
  const b = user({ id: "u-heavy", fullName: "Bea Heavy" });
  const existing = [
    // Bea already has 30h this week; Alex has 0.
    { userId: "u-heavy", startTime: new Date("2026-04-27T08:00:00"), endTime: new Date("2026-04-28T14:00:00") }, // 30h
  ];
  const result = autoAssign([shift()], [a, b], existing, [], []);
  assert.equal(result[0].userId, "u-light", "the lighter-loaded server should be picked");
});

test("emits a warning when assignment lands near the OT cap", () => {
  const u = user();
  // Pre-existing 33h, shift adds 5h → projected 38h (above 35h warn).
  const existing = [
    { userId: "u1", startTime: new Date("2026-04-27T08:00:00"), endTime: new Date("2026-04-28T17:00:00") }, // 33h
  ];
  const result = autoAssign([shift()], [u], existing, [], []);
  assert.equal(result[0].userId, "u1");
  assert.ok(result[0].warnings.length > 0, "should warn when near the OT band");
  assert.match(result[0].warnings[0], /near OT/);
});
