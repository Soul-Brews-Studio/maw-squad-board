#!/usr/bin/env bun
// squad-board — maw bun-dev plugin entry (shape follows fleet-plugins/p2p-share).
import { startServer } from "./server";

declare const process: any;

type InvokeContext = {
  source?: string;
  args?: string[];
  writer?: (line: string) => void;
};

type InvokeResult = {
  ok: boolean;
  output: string;
  error?: string;
  exitCode: number;
};

function parsePort(args: string[]): number | null {
  const idx = args.indexOf("--port");
  const port = idx >= 0 ? Number(args[idx + 1]) : 8790;
  return Number.isFinite(port) && port >= 1 && port <= 65535 ? port : null;
}

function parseHost(args: string[]): string {
  // default loopback; --host lets the owner expose to a trusted interface (e.g. wg mesh IP)
  const idx = args.indexOf("--host");
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : "127.0.0.1";
}

async function run(args: string[], log: (line: string) => void): Promise<number> {
  const port = parsePort(args);
  if (port === null) {
    log("squad-board: invalid port");
    return 1;
  }
  try {
    startServer(port, log, parseHost(args));
  } catch (e: any) {
    log(`squad-board: ${e?.message ?? e}`);
    return 1;
  }
  // long-running server — keep the process alive until interrupted
  await new Promise(() => {});
  return 0;
}

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const out: string[] = [];
  const log = (line: string) => (ctx.writer ? ctx.writer(line) : out.push(line));
  const args = ctx.source === "cli" || !ctx.source ? ctx.args || [] : [];
  const exitCode = await run(args, log);
  const ok = exitCode === 0;
  return { ok, output: ctx.writer ? "" : out.join("\n"), error: ok ? undefined : out.join("\n"), exitCode };
}

if (import.meta.main) {
  const code = await run(process.argv.slice(2), (line: string) => console.log(line));
  process.exit(code);
}
