import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";

export type DeliveryState = "delivered" | "failed" | "unknown";

const LEDGER_PATH = join(process.env.HOME ?? "", ".maw", "message-ledger.sqlite");
const VERIFY_TIMEOUT_MS = 3000;
const POLL_INTERVAL_MS = 100;

type LedgerRow = { state: string | null };

function mapLedgerState(state: string | null | undefined): DeliveryState {
  if (state === "delivered") return "delivered";
  if (state === "queued") return "unknown";
  return "failed";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readonlyLedgerUri(): string {
  const uri = pathToFileURL(LEDGER_PATH);
  uri.searchParams.set("mode", "ro");
  return uri.toString();
}

function latestState(target: string, sinceIso: string): string | null | undefined {
  if (!existsSync(LEDGER_PATH)) return undefined;

  const db = new Database(readonlyLedgerUri(), { readonly: true, strict: true });
  try {
    const row = db
      .query<LedgerRow, { target: string; sinceIso: string }>(
        `SELECT state
           FROM messages
          WHERE channel = 'hey'
            AND to_id = $target
            AND ts >= $sinceIso
          ORDER BY ts DESC
          LIMIT 1`,
      )
      .get({ target, sinceIso });
    return row?.state;
  } finally {
    db.close(false);
  }
}

export async function verifyDelivery(target: string, sinceIso: string): Promise<DeliveryState> {
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;

  while (Date.now() <= deadline) {
    try {
      const state = latestState(target, sinceIso);
      if (state !== undefined) return mapLedgerState(state);
      if (!existsSync(LEDGER_PATH)) return "unknown";
    } catch {
      return "unknown";
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(POLL_INTERVAL_MS, remaining));
  }

  return "unknown";
}
