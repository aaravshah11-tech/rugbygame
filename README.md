# Try Line

A 3D rugby union game for **iPhone and iPad**, built with Three.js, React and TypeScript, packaged as an installable PWA.

## Running

```bash
npm install
npm run dev        # serves on your network — open the printed address on an iPhone/iPad
npm run typecheck  # tsc -b
npm run build      # production build in dist/
npm run preview    # serve the production build
```

Install on iOS: open the site in Safari → Share → **Add to Home Screen**. It then launches full screen and works offline (service worker in `public/sw.js`).

### Device lock
`src/util/device.ts` allows only iPhone/iPad (iPadOS desktop-mode UAs are detected via multi-touch). Anything else gets a full-screen "only available on iPhone and iPad" page with a QR code to the site. iPhones in portrait get a rotate screen; iPad works in both orientations.

Dev builds only (`npm run dev`) accept testing flags:
- `?device=iphone` / `?device=ipad` — bypass the device lock in a desktop browser
- `?fast` — runs the match clock 20× faster
- `window.__engine.debugBreak()` in the console during a match — puts your fly-half through to test the try, replay and conversion

Production builds ignore both.

## Graphics

- **Players:** Quaternius stylised low-poly man (`Male_Shirt`), converted from the uploaded `.blend` with `scripts/blend_to_glb.py` and meshopt-compressed to `public/models/rugby_player.glb` (311 KB).
  - **Kit parts:** shirt, shorts and socks are separate materials, recoloured in code from each team's kit. Shirt patterns (hoops, stripes, halves, quarters, bands, yokes) are drawn in a shader in the mesh's bind-pose space, so they move with the body. The model's long trousers are cut into shorts, bare knees and socks at load time.
  - **Faces and heads:** a number decal on the back, eyebrows, varied hair, and scrum caps on some forwards.
  - **Build:** stylised proportions (bigger head and hands, broad shoulders); forwards are 15% bulkier.
- **Animations** (`src/game/view/assets.ts`):
  - From the model's own clips: idle, jog, sprint, fall (Death), get-up (Death reversed), celebrate (Jump) and hand-off (Punch).
  - Generated as skeletal clips from the Idle pose: pass, catch, kick, tackle, dive, sidestep and ruck-bind.
  - Clips are retargeted by bone name. Anything that fails to match falls back to Idle, so players never T-pose. Crossfades are 0.2 s; walk/run keep their stride phase when switching and play back at the measured stride speed.
- **Squad Viewer:** Settings → Squad Viewer shows all 15 players of any team on turntables, with buttons for every animation.
- **Stadiums:** each home side has its own ground (`src/data/venues.ts`), built by `src/game/view/stadium.ts` from a description: tiers per stand, open corners, grass banks, roof type (stands / closed / translucent), track, masts, seat colours and floodlights. Instanced billboard crowd in home colours that reacts to the play, scrolling LED boards with the ground's name, evening sky and PBR image lighting. Grass with mowing stripes and crisp lines; 16 m posts with team-coloured pads.
- **Effects:** ACES tone mapping and bloom, a real shadow on the six players nearest the ball plus blob shadows for everyone, a ball glow and trail, dust on tackles, confetti on tries, a TRY! banner and a slow-motion replay.
- **Quality:** Auto/Low/Medium/High in Settings. Auto chooses from the screen resolution, then steps down (and finally caps to 30 fps) if the frame rate drops. Low turns off shadows and bloom and thins the crowd.

## What's in it

| Area | Where |
| --- | --- |
| Match engine: state, loop, HUD, scene setup | `src/game/engine.ts` |
| Engine logic: `input`, `ai`, `contact` (tackles/offloads), `ball` (passing/kicking/physics), `rules`, `setpieces`, `drills`, `view` (render/replay/camera) | `src/game/engine/` |
| Tuning numbers (speeds, stamina, tackle reach, kick lengths, difficulty tables, prompt timeouts) | `src/game/gameConfig.ts` |
| Players, animation, kits, stadiums, effects, quality | `src/game/view/` |
| Touch controls (joystick, buttons, kick aim, layout editor support) | `src/ui/controls.tsx` |
| Mini-games, goal-kick swipe, score bug, scrum push | `src/ui/overlays.tsx` |
| Teams, squads, logos, venues | `src/data/`, `public/logos/` |
| Save data, daily rewards, coins, competitions | `src/state/` |
| Screens | `src/screens/` |

**Rules modelled (simplified):** tackles → rucks (the 9 waits at the base; "use it" after a while), mauls, knock-ons and forward passes → scrums (crouch-bind-set, then a push battle), touch → lineouts, 50:22, out on the full, offside with advantage, penalties (goal / touch / tap / scrum), yellow cards and the sin bin, TMO for close tries, tries, conversions (which can be charged down), penalty goals, drop goals, 22 drop-outs; the half ends at the next stoppage after 40:00. Strictness is set in Settings (Arcade / Standard / Simulation).

**Controls:** the joystick appears where your left thumb lands (push to the edge, or hold SPRINT, to sprint).
- **Attack:** ◀ PASS and PASS ▶ (hold = long pass; or one smart PASS in Settings), swipe left/right on the right half for a quick pass, STEP (or swipe up) to sidestep, HAND-OFF when a defender is close (it's a button, not automatic), OFFLOAD in the tackle, KICK (hold, slide to aim, swipe up; tap to choose the kick — or *Aim & power* in Settings), DROP GOAL in range, the MOVES strip and SET PLAYS menu (including plays you design on the pitch).
- **At the base of a ruck:** spin pass left/right, box kick, pick & go, snipe.
- **Defence:** TACKLE (hold to chase), DIVE, SWITCH, CONTEST / FAN OUT at rucks, COLLAPSE a maul, CHARGE conversions, swipe up to contest high balls.
- Buttons can be moved and resized in **Settings → Edit control layout**. A How to Play card appears before your first match (and in the pause menu).

**Haptics:** uses the Vibration API where available. iOS Safari has no Vibration API, so on iPhone it falls back to toggling a hidden `<input type="checkbox" switch>`, which produces a system haptic on iOS 18+.

**Audio:** all sound (crowd that swells near the try lines, whistle, tackle thud, clicks, menu music) is synthesised with Web Audio — no audio assets.

## Optional cloud sync (Supabase)

Progress is always saved locally (localStorage, mirrored to IndexedDB). To enable account sync, create a Supabase project and set:

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

then create the table:

```sql
create table profiles (
  id uuid primary key references auth.users,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "own row" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
```

Settings → Account then offers email magic-link sign-in with Upload / Download.

## Content notes
This is a private build: it uses real team names, squads (with estimated ratings), colours and logos supplied by the owner. Card packs are bought with in-game coins only — there are no real-money purchases.
