// Audio orchestrator: owns the AudioContext and the master/music/sfx mixing
// graph, and delegates actual sound synthesis to the effects and music modules.
import { SoundEffects } from './effects.ts';
import type { SfxName } from './effects.ts';
import { Music } from './music.ts';

export class AudioEngine {
	private ctx: AudioContext | null = null;
	private master!: GainNode;
	private musicGain!: GainNode;
	private sfxGain!: GainNode;
	private sfx: SoundEffects | null = null;
	private music: Music | null = null;
	enabled = true;

	// Must be called from a user gesture (click).
	resume(): void {
		if (!this.ctx) {
			const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			this.ctx = new Ctor();
			this.master = this.ctx.createGain();
			this.master.gain.value = 0.6;
			this.master.connect(this.ctx.destination);
			this.musicGain = this.ctx.createGain();
			this.musicGain.gain.value = 0.22;
			this.musicGain.connect(this.master);
			this.sfxGain = this.ctx.createGain();
			this.sfxGain.gain.value = 0.8;
			this.sfxGain.connect(this.master);
			this.sfx = new SoundEffects(this.ctx, this.sfxGain);
			this.music = new Music(this.ctx, this.musicGain);
		}
		if (this.ctx.state === 'suspended') void this.ctx.resume();
	}

	setMasterVolume(v: number): void {
		if (this.master) this.master.gain.value = v;
	}

	play(name: SfxName): void {
		if (!this.enabled || !this.ctx) return;
		this.sfx?.play(name);
	}

	startMusic(): void {
		this.music?.start();
	}

	stopMusic(): void {
		this.music?.stop();
	}
}
