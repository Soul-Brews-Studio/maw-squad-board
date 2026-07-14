#!/usr/bin/env bun
// squad-board CLI entry — starts the board server (localhost only).
import { startServer } from "./server";

const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 8790;

if (!Number.isFinite(port) || port < 1 || port > 65535) {
  console.error(`squad-board: invalid port`);
  process.exit(1);
}

startServer(port);
