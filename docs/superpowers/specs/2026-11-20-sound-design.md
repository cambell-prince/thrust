# Sound effects and music

## Goal

Give the game retro sound: effects for the ship firing, the ship's thrust, enemies firing,
explosions, picking up a dude and delivering one, plus background music that differs between
levels. It should feel like a C64 *Thrust*-style game, load by relative path like every other
asset, and keep every existing unit and e2e test passing in headless Chromium.

Out of scope: separate "enemy destroyed" / "ship died" sounds (the one explosion sound covers
every `explosion()`), a mission-complete fanfare, remembering mute across reloads, volume settings.

## Approach

A small `GameAudio` class wraps `scene.sound` with one method per game event, so `LevelScene`
makes one call at each hook. Rules that need no Phaser (the sound table, music switching) live in
`src/logic/audio.ts` and are unit-tested.

## Assets

All audio lives in `public/assets/audio/` and is committed.

### Sound effects (generated)

`scripts/make-sfx.mjs` (plain Node, no dependencies; `npm run sfx`) synthesizes sfxr-style sounds
(square, saw and noise oscillators, pitch slides, attack/decay envelopes) and writes mono 16-bit
44.1 kHz WAV files. The output is deterministic (a seeded PRNG for noise), so re-running it gives
the same files. Each sound's parameters are a named entry in the script, so tweaking one and
re-running is the workflow.

| Key | File | Sound |
|---|---|---|
| `ship-shot` | `audio/ship-shot.wav` | short square blip, falling pitch |
| `thrust` | `audio/thrust.wav` | ~1 s low filtered-noise rumble, seamless loop (no fade at either end) |
| `enemy-shot` | `audio/enemy-shot.wav` | lower, buzzier (saw) shot, distinct from the ship's |
| `explosion` | `audio/explosion.wav` | noise burst, falling pitch, decaying |
| `pickup` | `audio/pickup.wav` | rising two-note bling |
| `drop-off` | `audio/drop-off.wav` | brighter rising three-note arpeggio |

### Music (CC0, from OpenGameArt)

| Key | File | Source |
|---|---|---|
| `music-stargazer` | `audio/music-stargazer.mp3` | "Stargazer" by Centurion_of_war, CC0, https://opengameart.org/content/stargazer (`techno_stargazev2.1loop.ogg`) |
| `music-spaceshooter` | `audio/music-spaceshooter.mp3` | "8-bit epic space shooter music" by HydroGene, CC0, https://opengameart.org/content/8-bit-epic-space-shooter-music (`8bit-spaceshooter.mp3`) |

Each is downloaded once and re-encoded with ffmpeg to mono MP3 at ~96 kbps (MP3 because every
browser, Safari included, plays it). `public/assets/audio/CREDITS.md` records, per music file, the
title, author, source URL, original file name and licence (CC0). Credit is not required but is
given.

### Per-level music

Each map has a string property `music` naming a `MUSIC` key: level 1 `music-stargazer`, level 2
`music-spaceshooter`. Both `.tmx` files get the property and are re-exported with `npm run maps`.
`src/logic/mapProperties.ts` gains `stringProperty(properties, name, fallback)`, reading both
Tiled property formats like `numberProperty()`.

## Code

### `src/logic/audio.ts` (no Phaser import)

- `SOUNDS: readonly SoundDef[]`, `SoundDef = { key, file, volume, loop? }`: the six effects.
  Volumes are named constants, tuned by ear (effects ~0.5–0.7, thrust ~0.4).
- `MUSIC: readonly SoundDef[]`: the two tracks, `loop: true`, volume ~0.3.
- `musicAction(playingKey: string | null, wantedKey: string | null): 'keep' | 'start' | 'switch' | 'stop' | 'none'`
  - same key already playing → `keep`
  - nothing playing, a key wanted → `start`
  - one playing, a different key wanted → `switch`
  - one playing, none wanted → `stop`
  - nothing playing, none wanted → `none`
- `musicKey(value: string): string | null`: the value if it names a `MUSIC` key, else `null`
  (an unknown or empty `music` property means no music, not a crash).

### `src/audio/GameAudio.ts`

Constructed in `LevelScene.create()` with the scene and the level's music key.

- `shipShot()`, `enemyShot()`, `explosion()`, `pickup()`, `dropOff()`: `sound.play(key, { volume })`.
- `thrust(on: boolean)`: idempotent; keeps one looping `thrust` sound, plays it when `on` and it is
  not playing, stops it when `!on` and it is playing.
- `playMusic(key)`: applies `musicAction` against the music the game's sound manager is already
  playing. Phaser's sound manager belongs to the game, not the scene, so music survives
  `scene.restart()`; the same track carries on across a restart without a stutter. If
  `sound.locked` (the browser has not allowed audio yet), it waits for the manager's `UNLOCKED`
  event, which comes with the first key press.
- `toggleMute()`: flips `sound.mute`, returns the new state.
- On the scene's `SHUTDOWN` event the thrust loop is stopped and destroyed, so it never drones on
  into the next level. Music is not stopped there.

### `LevelScene` hooks

- `preload()`: `this.load.audio(key, file)` for every `SOUNDS` and `MUSIC` entry.
- `createLevel()`: `tuning.music = musicKey(stringProperty(props, 'music', ''))`.
- `create()`: `this.audio = new GameAudio(this)`, then `this.audio.playMusic(this.tuning.music)`;
  the M key toggles mute and refreshes the scoreboard.
- `shipShoot()`: `shipShot()` after a bullet is fired.
- `enemyShoot()`: `enemyShot()` only when a bullet is fired (not when line of sight is blocked).
- `explosion()`: `explosion()` when an explosion sprite is shown.
- `rescue()`: `pickup()`.
- the unload tween's `onComplete`, where the rescue scores: `dropOff()`.
- `update()`: `audio.thrust(thrusting)` every frame, where `thrusting` is true only while the ship
  is active, the level is not complete, up is held and there is fuel (`steer()` reports it). So
  thrust also stops when the ship dies, fuel runs out or the banner shows.

### Scoreboard

Shows `MUTED` (same text style, right of the score) while `scene.sound.mute` is true; `refresh()`
updates it.

## Testing

- `tests/unit/audio.test.ts`: every `musicAction` case; `musicKey` for known, unknown and empty
  values; `SOUNDS`/`MUSIC` keys unique, volumes in 0..1, every `MUSIC` entry loops.
- `tests/unit/mapProperties.test.ts`: `stringProperty` in both formats and the fallback.
- `tests/assets.test.ts`: every `SOUNDS` and `MUSIC` file exists under `public/assets/`; each is a
  RIFF/WAVE (`.wav`) or MP3 (`ID3` or frame sync) file; `audio/CREDITS.md` names every music file.
- `tests/level.test.ts`: each level's `music` property is a `MUSIC` key.
- `tests/e2e/audio.spec.ts`: after a key press the level's music is playing (read through
  `window.thrust.sound`); holding up starts the thrust loop and releasing it stops it; firing calls
  `sound.play('ship-shot', …)` (spied in the page). If headless Chromium's autoplay policy blocks
  this, `playwright.config.ts` adds `--autoplay-policy=no-user-gesture-required`.
- By ear: the generated effects and the volume balance are checked by playing the game in a
  browser, and the user listens to the result before merging.
