// Positions a new hire can self-select when enrolling via a venue link.
// Manager is intentionally excluded — self-enroll never grants admin access.
export const ENROLLABLE_POSITIONS = [
  "bartender",
  "server",
  "dishwasher",
  "busser",
  "cleaner",
  "host",
  "cook",
] as const;

export type EnrollablePosition = (typeof ENROLLABLE_POSITIONS)[number];

export function isEnrollablePosition(value: unknown): value is EnrollablePosition {
  return (
    typeof value === "string" &&
    (ENROLLABLE_POSITIONS as readonly string[]).includes(value)
  );
}
