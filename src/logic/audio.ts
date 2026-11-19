/** A sound the game loads: its key, its file under assets/, its volume and whether it loops. */
export interface SoundDef {
	key: string;
	file: string;
	volume: number;
	loop?: boolean;
}

// Volumes, tuned by ear: music sits under the effects, the thrust rumble under the shots.
const SHOT_VOLUME = 0.5;
const EXPLOSION_VOLUME = 0.6;
const BLING_VOLUME = 0.6;
const THRUST_VOLUME = 0.4;
const MUSIC_VOLUME = 0.3;

/** The sound effects, made by scripts/make-sfx.mjs. */
export const SOUNDS: readonly SoundDef[] = [
	{ key: 'ship-shot', file: 'audio/ship-shot.wav', volume: SHOT_VOLUME },
	{ key: 'enemy-shot', file: 'audio/enemy-shot.wav', volume: SHOT_VOLUME },
	{ key: 'explosion', file: 'audio/explosion.wav', volume: EXPLOSION_VOLUME },
	{ key: 'pickup', file: 'audio/pickup.wav', volume: BLING_VOLUME },
	{ key: 'drop-off', file: 'audio/drop-off.wav', volume: BLING_VOLUME },
	{ key: 'thrust', file: 'audio/thrust.wav', volume: THRUST_VOLUME, loop: true },
];

/** The music tracks a level can name in its `music` map property. See audio/CREDITS.md. */
export const MUSIC: readonly SoundDef[] = [
	{ key: 'music-stargazer', file: 'audio/music-stargazer.mp3', volume: MUSIC_VOLUME, loop: true },
	{ key: 'music-spaceshooter', file: 'audio/music-spaceshooter.mp3', volume: MUSIC_VOLUME, loop: true },
];

export type MusicAction = 'keep' | 'start' | 'switch' | 'stop' | 'none';

/** What to do with the music when a level starts, given the track playing and the one the level wants. */
export function musicAction(playingKey: string | null, wantedKey: string | null): MusicAction {
	if (playingKey === wantedKey) {
		return playingKey ? 'keep' : 'none';
	}
	if (!playingKey) {
		return 'start';
	}
	return wantedKey ? 'switch' : 'stop';
}

/** The value if it names a MUSIC track, else null (no music). */
export function musicKey(value: string): string | null {
	return MUSIC.some((m) => m.key === value) ? value : null;
}

/** The volume of a sound or track; 1 for a key in neither table. */
export function soundVolume(key: string): number {
	return [...SOUNDS, ...MUSIC].find((s) => s.key === key)?.volume ?? 1;
}
