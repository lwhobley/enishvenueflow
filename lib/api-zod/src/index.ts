// `export type * from "./generated/types"` was duplicating type names already
// declared by the zod schemas in ./generated/api (e.g. CreateUserBody) — TS
// flagged each as a duplicate export and the root typecheck refused to pass.
// Consumers that need a TS interface for a generated type should import it
// directly from "@workspace/api-zod/src/generated/types/<name>".
export * from "./generated/api";
