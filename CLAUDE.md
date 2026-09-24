# +1 Speed Anime Evolve

Browser multiplayer anime speed-evolution obby: Three.js client, Colyseus server, npm workspaces
(`shared` / `server` / `client`). Infrastructure (Bloxity auth, persistence, deploy) follows
the Evolution series (`D:\+1 Superhero Evoluion`); gameplay, world and UI are this game's own. The user's
reference screenshots are the visual target (HUD layout, windows, course look).

## Commands

```bash
npm run dev                 # builds shared, then server (tsx watch, :2591) + Vite client (:5191)
npm run build               # shared + server + client (client/dist)
npm run typecheck           # all workspaces
npm run verify              # verify:progression + verify:course + verify:assets (no server needed)
npm run verify:course       # route bot runs all 30 stages in the shared sim at their recommended level
npm run verify:capacity     # needs a running server; 18 clients, expects 15-per-room routing
npm run verify:multiplayer  # needs a running server; sync of run/sprint/jumps + every refusal
npm run verify:run          # needs a running server; the bot plays Stages 1-2 live, claims, evolves, reconnects
npm run verify:persistence  # identity/storage/migration/purchases, JSON and Mongo (if mongod is found)
npm run size:client         # client/dist against the 12 MB budget (~3.9 MB)
```

Do NOT use python from the Bash tool on this machine. Use node/sed/perl. Never commit or push: the user handles git.

## Non-negotiable rules

- Ports: server **2591**, Vite **5191**, preview 4191. Room `animeevolve`, Bloxity slug `speed-anime-evolve`, 15 per room.
- **Client build under 12 MB.** Characters are the supplied rig repainted at runtime (`client/src/anime/`),
  world and icons are code. Only `assets/` ships as files; `verify-assets` pins their digests.
- **Server-authoritative everything.** Clients send input and requests; the server simulates, validates and
  pays. Claims are detected from the SERVER position (`StageService`), never requested by the client.
- **One movement sim** (`shared/src/sim/PlayerSim.ts`) for server and prediction: run, AUTO-SPRINT after
  `sprintDelay` (no sprint key), coyote + ONE air jump, WALL-RUN on `kind: 'wallrun'` boxes, CLIMB on
  `kind: 'climb'` boxes, lava below `KILL_Y` off the hub. NO CHECKPOINTS: every death respawns at the SPAWN
  (`player.checkpoint` only records the stage whose start began the current run, for claims). Every `PlayerMotion` field is replicated on
  `PlayerState`, so client replays start from the server's exact state. Change a field -> change both.
- **Speed formula** (`shared/src/config/speed.ts`, the only place): XP per stride = character x trail x
  (1 + charms%) x rebirth power (x treadmill). Physical run speed = the LEVEL's speed
  (`runSpeedForLevel`, strictly rising, L15 = 27) x a SOFTENED boost from the same multiplier stack
  (`runSpeedFor` = level speed x (1 + 0.2 ln(total)), capped at `MAX_RUN_SPEED`). The server writes it to
  `moveSpeed` in `syncDerived`; nothing a client sends can change it. (Custom Speed, the pass buttons, the
  +Speed product row and the Store tile were removed at the user's request.)
- Pinned by `verify:progression`: the 12 characters/costs/multipliers, the 11 trails, the example charms,
  rebirth `1 + 0.5R` power and `15 + 15R` cap (dynamic), treadmills (2 x1 free, x1.5 @2R, x3 @3R),
  `xpToNext(24) = 129`, `xpToNext(25) = 133`, 30 stages, Stage 3 recommends 15 and pays 5.
- **Art direction: a colourful Roblox parkour world travelling through the WORLDS OF THE 12 EVOLUTIONS** -
  NOT generic anime Japan, NOT a pile of props. World parts use `MeshToonMaterial` with the SOFT bright
  `worldRamp` (characters keep the hard 3-band `toonGradient`) and the clean canvas surfaces of
  `client/src/world/japan/Surfaces.ts` (low-contrast bevelled slabs/planks/blocks/rock, neutral greys tinted by
  vertex colour; lava `WorldTextures.lava` is clean cracked lava).
- **12 ANIME WORLDS** (`japan/Themes.ts`, `WORLD_STAGES`, in evolution order, 2-3 stages each): Pirate Isles (Luffy,
  1-3), Hero City (Deku, 4-5), Cursed City (Yuji, 6-8), Ninja Village (Naruto, 9-10), Wisteria Mountains (Tanjiro,
  11-13), Wild Frontier (Gon, 14-15), Walled City (Eren, 16-18), Clover Kingdom (Asta, 19-20), City Z (Saitama,
  21-23), Rocky Plains (Goku, 24-25), Infinite Void (Gojo, 26-28), Soul Realm (Ichigo, 29-30). Each world has ONE
  controlled palette (base, light variant, one `accent`; never a random colour per object - the palettes live
  with the pieces in `worlds/SetPieces.ts`), its own atmosphere, lava, gate style (`arch/frame/torii/towers/rock`),
  wall-run style, two island colours (both contrasting with its lava), and ONE statue per stage of its character.
- **Banks: breathing room.** `dressStage` gives each bank ONE large set-piece (two on a long bank) from
  `Theme.pieces` (ships, lighthouses, hero towers, round houses, wisteria, town houses, castles, mesas, void
  crystals, white compounds...). No small-prop scatter, no random signs/bursts/bolts/lanterns. The only bursts
  left are the "WALL RUN!!" markers and the spawn's "GO GO GO!".
- **No overlapping geometry (z-fighting rules).** Every stage builds lava, banks and boundaries ONLY inside its own
  `stageRange` (`[startMinZ, goalMaxZ)`, stages are end to end); never lay two same-facing surfaces in one plane
  (offset by >= 0.1 or abut); snow caps are fatter than their peaks; camera `near` is 0.4 (not 0.1) for depth
  precision. Check new pieces for coplanar faces before adding them.
- **Anime layer** (`client/src/world/anime/AnimeKit.ts`): statues (the real character bodies, shared geometry via
  `userData.sharedGeometry`, never disposed; on floating islands at x=+/-36 with tops at y=10, out of jump reach),
  comic bursts, energy orbs, aura rings, sparkles. Animated objects carry `userData.tick(time)`. Nothing collides.
- **Wall-run BUILDINGS**: the collision walls are thick (`WALLRUN_DEPTH` 7, outward from the running face at
  x=+/-11) and tall (`WALLRUN_TOP` 20, above any jump); `CourseWorld` draws them in the world's style
  (`Theme.wallRun`: ship / city / temple / dojo / fort / rock / crystal) with a bright running face, forward
  chevrons, buttresses and end towers set just outside the body's faces. Nothing goes into the channel.
- **Side boundaries** (`japan/Boundary.ts`, per stage, both sides, its own range only), per world
  (`Theme.boundary`): abutting cliff/crystal blocks (alternating depths, never coplanar) in front of a level plateau,
  a great wall (one continuous block + merlons/towers), or a city row on a base; a few large skyline pieces on it;
  a snow-free ridge or the sea beyond. Scenery only: never collides, never climbable or wall-runnable.
- **Spawn hub** palette: white stone, blue roofs, one gold accent; purple only at the evolve shrine.
- **Name plates**: every runner (remote AND your own, `Game.localPlate` at 0.6 size so it never covers the course)
  shows its portal portrait over its name (`player/NamePlate.ts`); no portrait -> the portal default, and an
  initial badge until an image loads.
- **Islands are WIDE** (platforms ~28-40 across, pillars 12-16, bridges 10-13, start 44, goal 52, wall-run
  channel 22); the course LENGTH is unchanged. Auto-sprint after `sprintDelay` 0.7 s (ramp 0.35 s).
- **The course is generated** (`shared/src/config/map.ts`, deterministic): each stage = start platform
  (checkpoint, torii, sign) + shuffled sections (hops, wall-run channel, pillars, climb wall, bridge) + goal
  (claim pad on the runner's right). Gaps scale with the stage's design speed.
  After ANY change to map/movement numbers run `npm run verify:course` - every stage must stay completable.

## Layout facts

- Spawn (0, 0, -6) faces +Z. LEFT (+X): boards (Wins / Total Playtime / Total Rebirths) at x=50,
  z = -30 / -6 / 18, 17 x 15, roofed notice boards on their own posts, 10 units clear of the wall.
  RIGHT (-X): treadmills at x=-44. BACK (-Z): charm shop (counter z=-46, pad z=-39). Evolve shrine
  (ring + next-evolution statue) at (-18, 6) - kept OFF the straight path to Stage 1.
- Hub ground x -60..60, z -56..36; Stage 1 starts at z=36 through the gap in the front cliff.
- Rendering builds each stage lazily near the runner (`CourseWorld`), all scenery non-colliding.

## Progress and identity

Per-key storage (`server/src/persistence/`), Mongo via `MONGODB_URI` else JSON (`ANIME_DATA_DIR`), profile
read at join, Bloxity token verified server-side, guest -> account migration. NO Bux / paid products:
Wins (earned on the course) are the only currency - no passes, skips, restocks or webhook. Profile: `level, xp, totalXp, wins, lifetimeWins, rebirths, ownedCharacters, characterSlot,
ownedTrails, trailId, charms, equippedCharms, bestStage, playSeconds,
shopWindow, shopBought`.
