# Try Line

A 3D rugby union game for **iPhone and iPad**, built with Three.js, React and TypeScript, packaged as an installable PWA.

## Running

```bash
npm install
npm run dev        # http://<your-ip>:5173 — open on an iPhone/iPad on the same network
npm run build      # production build in dist/
npm run preview    # serve the production build
```

Install on iOS: open the site in Safari → Share → **Add to Home Screen**. It then launches full screen and works offline (service worker in `public/sw.js`).

### Device lock
`src/util/device.ts` allows only iPhone/iPad (iPadOS desktop-mode UAs are detected via multi-touch). Anything else gets a full-screen "only available on iPhone and iPad" page with a QR code to the site. iPhones in portrait get a rotate screen; iPad works in both orientations.

Dev builds only (`npm run dev`) accept two testing flags:
- `?device=iphone` / `?device=ipad` — bypass the device lock in a desktop browser
- `?fast` — runs the match clock 20× faster

Production builds ignore both.

## What's in it

| Area | Where |
| --- | --- |
| Match engine: rules, AI, ball physics, phases, camera | `src/game/engine.ts` |
| Stadium, pitch texture, instanced shader-animated crowd | `src/game/stadium.ts` |
| Low-poly players, procedural animation, original kits | `src/game/model.ts`, `src/game/kit.ts` |
| Touch controls (joystick, contextual buttons) | `src/ui/controls.tsx` |
| Mini-games, place-kick swing meter, score bug, commentary | `src/ui/overlays.tsx` |
| Nations, fictional players, ratings / OVR | `src/data/` |
| Save data, daily challenges, login rewards, coins | `src/state/store.ts` |
| Championship / World Cup / season logic | `src/state/tournaments.ts` |
| Screens | `src/screens/` |

**Rules modelled (simplified):** tackles → rucks (timing bar to secure / jackal), mauls (tap to drive), knock-ons and forward passes → scrums (crouch-bind-set timing), touch → lineouts (throw/steal timing), breakdown offside and other penalties (kick at goal / kick to touch / tap & go), tries, conversions, penalty goals, drop goals, 22 drop-outs, and the half ends at the next stoppage after the clock passes 40:00.

**Controls:** joystick bottom-left. Attack: Pass (tap = short, hold = long, swipe the button ◀ ▶ for side), Kick (hold for power, drag to aim; arc preview shown), Step, Fend, Sprint, plus a Set Plays menu. Defence: Tackle, Dive, Switch, Sprint.

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
Real country names only; every kit is an original design in national colours with no logos or crests. All player names are randomly generated fictional combinations. Card packs are bought with in-game coins only — there are no real-money purchases.
