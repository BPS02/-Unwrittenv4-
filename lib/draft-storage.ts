export const DRAFT_KEY = "liner-notes:draft:v2";
export const AUTH_RETURN_KEY = "liner-notes:auth-return:v1";
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface ExpiringValue<T> {
  value: T;
  expiresAt: number;
}

export function packExpiring<T>(value: T, now = Date.now()): string {
  return JSON.stringify({ value, expiresAt: now + DRAFT_TTL_MS });
}

export function unpackExpiring<T>(raw: string | null, now = Date.now()): T | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ExpiringValue<T>>;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now) return null;
    return parsed.value ?? null;
  } catch {
    return null;
  }
}

export function safeReturnRoute(value: string | null): "/create" | "/songs" {
  return value === "/songs" ? "/songs" : "/create";
}

/**
 * Pending action across the sign-in redirect. Only the action NAME and a safe
 * return route are stored — never draft content, and never in the URL. The
 * draft itself (including finished lyrics) already lives under DRAFT_KEY.
 */
export const PENDING_ACTION_KEY = "liner-notes:pending-action:v1";

export interface PendingAction {
  action: "generate_music";
  returnTo: "/create";
}

export function isPendingAction(value: unknown): value is PendingAction {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as PendingAction).action === "generate_music" &&
    (value as PendingAction).returnTo === "/create"
  );
}
