import Phaser from 'phaser';
import { isMuted, MUSIC, MUTED_KEY, musicAction, soundVolume } from '../logic/audio.ts';

/**
 * The game's sounds, one method per event. The sound manager belongs to the game, not the scene,
 * so music carries on across scene restarts; the thrust loop belongs to this scene and is
 * destroyed when it shuts down. A sound missing from the audio cache (not found or not decodable)
 * is skipped, so the game plays on silently.
 */
export class GameAudio {
	sound: Phaser.Scene['sound'];
	registry: Phaser.Data.DataManager;
	cache: Phaser.Cache.BaseCache;
	/** Undefined when the thrust sound didn't load. */
	thrustLoop: Phaser.Sound.BaseSound | undefined;
	/** Set while music waits for the browser to allow audio; removed if the scene shuts down first. */
	pendingMusic: (() => void) | undefined;

	constructor(scene: Phaser.Scene) {
		this.sound = scene.sound;
		this.registry = scene.registry;
		this.cache = scene.cache.audio;
		this.thrustLoop = this.loaded('thrust')
			? this.sound.add('thrust', { loop: true, volume: soundVolume('thrust') })
			: undefined;
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.thrustLoop?.destroy(); // stops it too
			if (this.pendingMusic) {
				this.sound.off(Phaser.Sound.Events.UNLOCKED, this.pendingMusic);
				this.pendingMusic = undefined;
			}
		});
	}

	/** Whether the key's audio loaded and decoded. */
	loaded(key: string): boolean {
		return this.cache.exists(key);
	}

	/**
	 * Whether sound can play now. While the browser keeps audio locked (before the first key press)
	 * or the WebAudio context is suspended (pauseOnBlur), effects would queue and all play at once
	 * when it resumes, so they are skipped instead.
	 */
	get audible(): boolean {
		if (this.sound.locked) {
			return false;
		}
		return !('context' in this.sound) || this.sound.context.state === 'running';
	}

	/** Play a one-shot effect, unless sound can't play now or the effect didn't load. */
	play(key: string): void {
		if (this.audible && this.loaded(key)) {
			this.sound.play(key, { volume: soundVolume(key) });
		}
	}

	shipShot(): void { this.play('ship-shot'); }
	enemyShot(): void { this.play('enemy-shot'); }
	explosion(): void { this.play('explosion'); }
	pickup(): void { this.play('pickup'); }
	dropOff(): void { this.play('drop-off'); }

	/** Keep the thrust loop running while `on`; start and stop it only on a change. */
	thrust(on: boolean): void {
		const loop = this.thrustLoop;
		// While locked, play() would queue (HTML5 Audio) and leave isPlaying false, so wait instead.
		if (!loop || this.sound.locked) {
			return;
		}
		if (on && !loop.isPlaying) {
			loop.play();
		} else if (!on && loop.isPlaying) {
			loop.stop();
		}
	}

	/**
	 * Play the level's track (null, or a track that didn't load: none), keeping the one already
	 * playing if it's the same.
	 */
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
		const wanted = key && this.loaded(key) ? key : null;
		const action = musicAction(playing?.key ?? null, wanted);
		if ((action === 'switch' || action === 'stop') && playing) {
			playing.destroy();
		}
		if ((action === 'start' || action === 'switch') && wanted) {
			this.sound.add(wanted, { loop: true, volume: soundVolume(wanted) }).play();
		}
	}

	/** Mute or unmute everything; returns true when now muted. */
	toggleMute(): boolean {
		const muted = !this.muted;
		this.registry.set(MUTED_KEY, muted);
		this.sound.mute = muted;
		return muted;
	}

	get muted(): boolean {
		return isMuted(this.registry);
	}
}
