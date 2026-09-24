# +1 Speed Anime Evolve

A browser multiplayer anime speed obby. Every step you run is Speed. Level up, sprint faster, evolve from
Luffy through twelve anime heroes to Ichigo, run 30 lava stages of wall-runs, climbs and parkour, and
rebirth for more Power.

Three.js client, authoritative Colyseus server (15 players per room), hosted on Bloxity.

## Play

| Action | PC | Mobile |
| --- | --- | --- |
| Run (sprints on its own after 2 s) | WASD / arrows | left stick |
| Jump / double jump / wall jump | Space | JUMP |
| Wall-run | jump at a glass wall and keep moving | same |
| Climb | run into a wall marked with arrows | same |
| Backpack / Teleport / Rebirth / Evolve / Rewards | B / T / R / E / G | left tiles |

Standing on the Evolve ring opens Evolve, the pad in front of the Charm Shop opens the shop, and the gold
pad at the end of every stage pays its Wins and sends you home.

## Develop

```bash
npm install
npm run dev
```

Client on http://localhost:5191, server on :2591. See `CLAUDE.md` for the rules and verification scripts.

## Deploy (Bloxity Hosting)

`.github/workflows/deploy.yml` publishes `dev` -> DEV and `main` -> PROD (game id `speed-anime-evolve`):
the server image to GHCR (`ghcr.io/<owner>/speed-anime-evolve-server`, must be public), rolled on Legion
with `seatCap` 15; the client zipped and uploaded to Bloxity Hosting. Secret: `LEGION_DEPLOY_TOKEN`
(optional `GHCR_PUSH_TOKEN`). The commit SHA is the deployed version of both halves.

| Channel | Branch | Frontend | Backend (HTTP / WSS) |
| --- | --- | --- | --- |
| DEV | `dev` | https://speed-anime-evolve.dev.play.bloxity.io | https://speed-anime-evolve.dev.host.bloxity.io / `wss://speed-anime-evolve.dev.host.bloxity.io` |
| PROD | `main` | https://speed-anime-evolve.play.bloxity.io | https://speed-anime-evolve.host.bloxity.io / `wss://speed-anime-evolve.host.bloxity.io` |

The GHCR package must stay public: Bloxity pulls the image anonymously.
