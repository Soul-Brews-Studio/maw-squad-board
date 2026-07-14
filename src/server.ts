// squad-board server — Bun, loopback-only ("localhost zero-cred" fleet pattern).
// State is a projection: oracles come fresh from `maw ls`, squads persist to squads.json.
import { file, write, spawn } from "bun";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SQUADS_PATH = join(ROOT, "data", "squads.json");

// Aligned with fleet-plugins/team/contract.json members[] shape
type Member = { agentType: string; tmuxPaneId: string };
type Squad = { name: string; members: Member[]; createdAt: string };

async function loadSquads(): Promise<Squad[]> {
  try {
    return await file(SQUADS_PATH).json();
  } catch {
    return [];
  }
}

async function saveSquads(squads: Squad[]) {
  await write(SQUADS_PATH, JSON.stringify(squads, null, 2));
}

async function run(cmd: string[]): Promise<{ ok: boolean; out: string }> {
  const p = spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  const err = await new Response(p.stderr).text();
  const code = await p.exited;
  return { ok: code === 0, out: code === 0 ? out : err };
}

async function listOracles(): Promise<string[]> {
  const { ok, out } = await run(["maw", "ls"]);
  if (!ok) return [];
  // strip ansi, take the session token per line
  return out
    .split("\n")
    .map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim())
    .filter((l) => l.startsWith("●") || l.startsWith("◌") || l.startsWith("◐"))
    .map((l) => l.split(/\s+/)[1])
    .filter(Boolean);
}

export function startServer(port: number, log: (line: string) => void = console.log) {
  const server = Bun.serve({
    hostname: "127.0.0.1", // loopback only — broadcast power must not leave the machine
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/") {
        return new Response(file(join(ROOT, "web", "index.html")));
      }

      if (url.pathname === "/api/oracles") {
        return Response.json(await listOracles());
      }

      if (url.pathname === "/api/squads" && req.method === "GET") {
        return Response.json(await loadSquads());
      }

      if (url.pathname === "/api/squads" && req.method === "POST") {
        const body = (await req.json()) as { name: string; members: string[] };
        if (!body.name || !Array.isArray(body.members)) {
          return Response.json({ error: "need {name, members[]}" }, { status: 400 });
        }
        const squads = await loadSquads();
        const squad: Squad = {
          name: body.name,
          members: body.members.map((m) => ({ agentType: "member", tmuxPaneId: m })),
          createdAt: new Date().toISOString(),
        };
        const next = squads.filter((s) => s.name !== squad.name).concat(squad);
        await saveSquads(next);
        return Response.json(squad);
      }

      if (url.pathname === "/api/broadcast" && req.method === "POST") {
        const body = (await req.json()) as { squad: string; message?: string };
        const squads = await loadSquads();
        const squad = squads.find((s) => s.name === body.squad);
        if (!squad) return Response.json({ error: "squad not found" }, { status: 404 });

        const roster = squad.members.map((m) => m.tmuxPaneId).join(", ");
        const text =
          body.message ??
          `squad-board: you are in squad '${squad.name}' — members: ${roster}. We are the same team; reply to each other directly.`;

        const results = [];
        for (const m of squad.members) {
          const { ok, out } = await run(["maw", "hey", m.tmuxPaneId, `${text} --from squad-board`]);
          results.push({ to: m.tmuxPaneId, ok, out: out.trim().slice(0, 200) });
        }
        return Response.json({ squad: squad.name, sent: results });
      }

      return new Response("not found", { status: 404 });
    },
  });

  log(`squad-board: http://127.0.0.1:${server.port} (loopback only)`);
}
