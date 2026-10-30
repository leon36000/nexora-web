import type { RagFailure } from "./failure";

export type Result<T> = { ok: true; value: T } | { ok: false; failure: RagFailure };
export const good = <T>(value: T): Result<T> => ({ ok: true, value });
export const bad = (failure: RagFailure): Result<never> => ({ ok: false, failure });
