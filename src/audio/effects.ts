// Procedural sound effects via the Web Audio API.
// No external assets — everything is synthesised at runtime.
export type SfxName = 'shoot' | 'rocket' | 'explosionSmall' | 'explosionBig' | 'build' | 'complete' | 'select' | 'move' | 'deny' | 'harvest';

export class SoundEffects {
	private lastPlayed = new Map<SfxName, number>();

	constructor(
		private ctx: AudioContext,
		private out: GainNode
	) {}

	private now(): number {
		return this.ctx.currentTime;
	}

	// Throttle identical sounds so bursts don't overwhelm the mix.
	private throttle(name: SfxName, ms: number): boolean {
		const t = performance.now();
		const last = this.lastPlayed.get(name) ?? 0;
		if (t - last < ms) return false;
		this.lastPlayed.set(name, t);
		return true;
	}

	private noiseBuffer(duration: number): AudioBuffer {
		const ctx = this.ctx;
		const len = Math.floor(ctx.sampleRate * duration);
		const buf = ctx.createBuffer(1, len, ctx.sampleRate);
		const data = buf.getChannelData(0);
		for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
		return buf;
	}

	play(name: SfxName): void {
		switch (name) {
			case 'shoot':
				if (!this.throttle('shoot', 40)) return;
				this.gunshot();
				break;
			case 'rocket':
				if (!this.throttle('rocket', 80)) return;
				this.rocketLaunch();
				break;
			case 'explosionSmall':
				if (!this.throttle('explosionSmall', 50)) return;
				this.explosion(0.35, 220);
				break;
			case 'explosionBig':
				if (!this.throttle('explosionBig', 60)) return;
				this.explosion(0.7, 90);
				break;
			case 'build':
				this.blip(180, 0.08, 'square');
				break;
			case 'complete':
				this.arp([440, 660, 880], 0.09);
				break;
			case 'select':
				if (!this.throttle('select', 60)) return;
				this.blip(660, 0.05, 'triangle');
				break;
			case 'move':
				if (!this.throttle('move', 60)) return;
				this.blip(520, 0.05, 'sine');
				break;
			case 'deny':
				this.blip(140, 0.12, 'sawtooth');
				break;
			case 'harvest':
				if (!this.throttle('harvest', 400)) return;
				this.blip(90, 0.18, 'sine');
				break;
		}
	}

	private gunshot(): void {
		const ctx = this.ctx;
		const src = ctx.createBufferSource();
		src.buffer = this.noiseBuffer(0.12);
		const filter = ctx.createBiquadFilter();
		filter.type = 'highpass';
		filter.frequency.value = 900;
		const g = ctx.createGain();
		const t = this.now();
		g.gain.setValueAtTime(0.5, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
		src.connect(filter).connect(g).connect(this.out);
		src.start(t);
		src.stop(t + 0.12);
	}

	private rocketLaunch(): void {
		const ctx = this.ctx;
		const src = ctx.createBufferSource();
		src.buffer = this.noiseBuffer(0.4);
		const filter = ctx.createBiquadFilter();
		filter.type = 'bandpass';
		const t = this.now();
		filter.frequency.setValueAtTime(400, t);
		filter.frequency.exponentialRampToValueAtTime(1600, t + 0.3);
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.35, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
		src.connect(filter).connect(g).connect(this.out);
		src.start(t);
		src.stop(t + 0.4);
	}

	private explosion(duration: number, lowFreq: number): void {
		const ctx = this.ctx;
		const src = ctx.createBufferSource();
		src.buffer = this.noiseBuffer(duration);
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		const t = this.now();
		filter.frequency.setValueAtTime(1200, t);
		filter.frequency.exponentialRampToValueAtTime(lowFreq, t + duration);
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.9, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + duration);
		src.connect(filter).connect(g).connect(this.out);
		// low boom
		const osc = ctx.createOscillator();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(lowFreq, t);
		osc.frequency.exponentialRampToValueAtTime(lowFreq * 0.4, t + duration);
		const og = ctx.createGain();
		og.gain.setValueAtTime(0.6, t);
		og.gain.exponentialRampToValueAtTime(0.001, t + duration);
		osc.connect(og).connect(this.out);
		src.start(t);
		src.stop(t + duration);
		osc.start(t);
		osc.stop(t + duration);
	}

	private blip(freq: number, dur: number, type: OscillatorType): void {
		const ctx = this.ctx;
		const osc = ctx.createOscillator();
		osc.type = type;
		osc.frequency.value = freq;
		const g = ctx.createGain();
		const t = this.now();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		osc.connect(g).connect(this.out);
		osc.start(t);
		osc.stop(t + dur + 0.02);
	}

	private arp(freqs: number[], step: number): void {
		freqs.forEach((f: number, i: number): void => {
			const ctx = this.ctx;
			const osc = ctx.createOscillator();
			osc.type = 'square';
			osc.frequency.value = f;
			const g = ctx.createGain();
			const t = this.now() + i * step;
			g.gain.setValueAtTime(0.0001, t);
			g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
			g.gain.exponentialRampToValueAtTime(0.0001, t + step);
			osc.connect(g).connect(this.out);
			osc.start(t);
			osc.stop(t + step + 0.02);
		});
	}
}
