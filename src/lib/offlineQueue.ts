import { toast } from "sonner";
import { authFetch } from "./api";

/**
 * Offline write queue (Wave 13).
 *
 * The offline banner told the user they were offline — and then their action simply
 * failed. For the writes that matter in the field (recording a payment, adding an expense,
 * creating an invoice), failing because of a dead spot is data loss: the user won't
 * re-type it later.
 *
 * queuedPost() tries the network first. If the device is offline (or the request dies the
 * way dropped connections do), the write is stored locally WITH the Idempotency-Key it was
 * born with and replayed when the connection returns — the server-side idempotency layer
 * (Wave 1) makes the replay safe even if the original actually landed.
 *
 * Deliberately opt-in per call site: blindly queueing every failed POST would replay
 * things whose context is gone. Only enqueue what is meaningful to apply late.
 */
type QueuedWrite = { id: string; path: string; body: unknown; label: string; queuedAt: string; idempotencyKey: string };

const KEY = "hr_offline_queue";
const MAX_QUEUE = 50;

const readQueue = (): QueuedWrite[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const writeQueue = (q: QueuedWrite[]) => { try { localStorage.setItem(KEY, JSON.stringify(q.slice(0, MAX_QUEUE))); } catch { /* full/private */ } };

export const queuedCount = () => readQueue().length;

const isNetworkFailure = (e: unknown) =>
  !navigator.onLine || (e instanceof TypeError && /fetch|network|load failed/i.test(e.message));

/** POST that survives a dead spot. Returns { queued: true } instead of throwing when offline. */
export async function queuedPost<T>(path: string, body: unknown, label: string): Promise<T | { queued: true }> {
  const idempotencyKey = crypto.randomUUID();
  try {
    return await authFetch<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Idempotency-Key": idempotencyKey },
    });
  } catch (e) {
    if (!isNetworkFailure(e)) throw e; // a real 4xx/5xx is an answer, not a dead spot
    const q = readQueue();
    // At the cap the old code appended and then sliced to the first MAX — silently
    // discarding the write it had just promised to keep. Refuse honestly instead: the
    // user still has the data on screen and can retry, which is strictly better than a
    // "saved" toast for something that was thrown away.
    if (q.length >= MAX_QUEUE) {
      toast.error(`Can't save "${label}" offline — ${MAX_QUEUE} items are already waiting to send. Reconnect first.`, { duration: 8000 });
      throw e;
    }
    q.push({ id: idempotencyKey, path, body, label, queuedAt: new Date().toISOString(), idempotencyKey });
    writeQueue(q);
    toast.info(`Saved on this device — "${label}" will send when you're back online.`, { duration: 6000 });
    return { queued: true };
  }
}

/** Replay everything queued. Called on 'online' and app start; safe to call repeatedly. */
let flushing = false;
export async function flushQueue(): Promise<{ sent: number; kept: number }> {
  // Single-flight, and the queue is SNAPSHOTTED then atomically drained: a write queued
  // while the flush's awaits were in progress used to be clobbered by the flush's final
  // write-back (read-modify-write race) — the one loss this module exists to prevent.
  if (flushing) return { sent: 0, kept: readQueue().length };
  flushing = true;
  try {
  const q = readQueue();
  if (!q.length || !navigator.onLine) return { sent: 0, kept: q.length };
  const snapshotIds = new Set(q.map((i) => i.id));
  const kept: QueuedWrite[] = [];
  let sent = 0;
  for (const item of q) {
    try {
      await authFetch(item.path, {
        method: "POST",
        body: JSON.stringify(item.body),
        // The ORIGINAL key: if the first attempt actually reached the server before the
        // connection died, this replay returns that stored response instead of a duplicate.
        headers: { "Idempotency-Key": item.idempotencyKey },
      });
      sent++;
    } catch (e) {
      if (isNetworkFailure(e)) { kept.push(item); continue; } // still offline — try later
      // Transient server-side conditions are NOT rejections: a 503 mid-deploy, a 429, a
      // 409 IN_FLIGHT (the server is still processing this very key), or a 401 while the
      // token refreshes would all have thrown the user's work away. Keep those and retry.
      const status = (e as { status?: number; code?: string })?.status;
      const code = (e as { code?: string })?.code;
      const transient = status === undefined || status >= 500 || status === 429 || status === 401 || code === "IN_FLIGHT";
      if (transient) { kept.push(item); continue; }
      // A genuine rejection (validation, permission): drop it, but never silently — the
      // whole point of this module is that work doesn't vanish without the user knowing.
      toast.error(`"${item.label}" (saved offline) was rejected: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }
  // Merge, don't overwrite: anything enqueued while we were sending survives.
  const late = readQueue().filter((i) => !snapshotIds.has(i.id));
  writeQueue([...kept, ...late]);
  if (sent) toast.success(`Back online — ${sent} saved item${sent === 1 ? "" : "s"} sent.`);
  return { sent, kept: kept.length + late.length };
  } finally { flushing = false; }
}

export function installOfflineQueue() {
  window.addEventListener("online", () => { void flushQueue(); });
  // Also flush on start: the app may have been closed while offline.
  if (navigator.onLine) setTimeout(() => { void flushQueue(); }, 3000);
}
