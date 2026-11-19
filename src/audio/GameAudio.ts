import Phaser from 'phaser';
import { MUSIC, musicAction, soundVolume } from '../logic/audio.ts';

/**
 * The game registry key that holds whether the sound is muted. The WebAudio manager's `mute`
 * getter reads a gain node that only updates once the audio thread has run, so it is stale right
 * after it is set; the registry, like the manager, lasts across scene restarts.
 */
export const MUTED = 'muted';

/**
 * The game's sounds, one method per event. The sound manager belongs to the game, not the scene,
 * so music carries on across scene restarts; the thrust loop belongs to this scene and is
 * destroyed when it shuts down.
 */
export class GameAudio {
	sound: Phaser.Sound.BaseSoundManager;
	registry: Phaser.Data.DataManager;
	thrustLoop: Phaser.Sound.BaseSound;
	/** Set while music waits for the browser to allow audio; removed if the scene shuts down first. */
	pendingMusic: (() => void) | undefined;

	constructor(scene: Phaser.Scene) {
		this.sound = scene.sound;
		this.registry = scene.registry;
		this.thrustLoop = this.sound.add('thrust', { loop: true, volume: soundVolume('thrust') });
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.thrustLoop.destroy(); // stops it too
			if (this.pendingMusic) {
				this.sound.off(Phaser.Sound.Events.UNLOCKED, this.pendingMusic);
				this.pendingMusic = undefined;
			}
		});
	}

	play(key: string): void {
		this.sound.play(key, { volume: soundVolume(key) });
	}

	shipShot(): void { this.play('ship-shot'); }
	enemyShot(): void { this.play('enemy-shot'); }
	explosion(): void { this.play('explosion'); }
	pickup(): void { this.play('pickup'); }
	dropOff(): void { this.play('drop-off'); }

	/** Keep the thrust loop running while `on`; start and stop it only on a change. */
	thrust(on: boolean): void {
		if (on && !this.thrustLoop.isPlaying) {
			this.thrustLoop.play();
		} else if (!on && this.thrustLoop.isPlaying) {
			this.thrustLoop.stop();
		}
	}

	/** Play the level's track (null: none), keeping the one already playing if it's the same. */
	playMusic(key: string | null): void {
		if (this.sound.locked) {
			this.pendingMusic = () => {
				this.pendingMusic = undefined;
				this.playMusic(key);
			};
			this.sound.once(Phaser.Sound.Events.UNLOCKED, this.pendingMusic);
			return;
		}
		// Every music sound, not just the playing ones: one paused by pauseOnBlur still counts.
		// A destroyed one stays in the manager until its next update, so skip those.
		const playing = MUSIC.flatMap((m) => this.sound.getAll(m.key)).find((s) => !s.pendingRemove);
		const action = musicAction(playing?.key ?? null, key);
		if ((action === 'switch' || action === 'stop') && playing) {
			playing.destroy();
		}
		if ((action === 'start' || action === 'switch') && key) {
			this.sound.add(key, { loop: true, volume: soundVolume(key) }).play();
		}
	}

	/** Mute or unmute everything; returns true when now muted. */
	toggleMute(): boolean {
		const muted = !this.muted;
		this.registry.set(MUTED, muted);
		this.sound.mute = muted;
		return muted;
	}

	get muted(): boolean {
		return this.registry.get(MUTED) === true;
	}
}
