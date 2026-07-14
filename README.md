# maw-squad-board

Board UI to group oracles into **squads** and broadcast `maw hey` to the whole team at once.

> oracle = node · hey = edge · squad = the cluster you can talk to as one

Part of the maw plugin family (bun-dev tier). Repo name carries the `maw-` prefix
(family discoverability); the plugin/command name is plain `squad-board`.

## Install

```sh
git clone https://github.com/Soul-Brews-Studio/maw-squad-board ~/.maw/plugins/squad-board
maw squad-board            # starts the board at http://127.0.0.1:8790
```

Requires [Bun](https://bun.sh) and [maw](https://github.com/Soul-Brews-Studio/maw-rs). No other dependencies — Bun built-ins only.

## Use

1. Open http://127.0.0.1:8790 (loopback only, by design — broadcast power must not leave the machine)
2. Check oracles in the left rail (live from `maw ls`)
3. Name the squad → **create from checked**
4. **📢 broadcast to squad** → every member gets a `maw hey`:
   _"you are in squad X — members: …. We are the same team; reply to each other directly."_

## API

| Route | Method | Does |
|---|---|---|
| `/api/oracles` | GET | live session list (shell-out `maw ls`) |
| `/api/squads` | GET/POST | list / create-replace squad `{name, members[]}` |
| `/api/broadcast` | POST | `{squad, message?}` → `maw hey` each member |

Squads persist to `data/squads.json` with `members[]` shaped after
`fleet-plugins/team/contract.json` (maw team #494) — no new schema invented.

## Design lineage

- Survey + design brief: meta-oracle `ψ/writing/2026-07-14_oracle-squad-design-brief.md` (7 oracle sources)
- Hey-graph data: nh fleet-bus + `~/.maw/message-ledger.sqlite`
- Board UI roadmap: agora canvas engine (tiles/drag) + parliament `parentId` squad boxes + maw-patchies typed nodes
- Naming: fleet vote 7:1, 2026-07-14

## Capabilities (plugin.json)

`net:listen:localhost` · `proc:exec:maw` · `fs:read:fleet-state` · `fs:write:plugin`

bun-dev tier — declarative caps (documented intent), precedent: p2p-share.

---

🤖 ตอบโดย meta จาก [Nat] → meta-oracle
