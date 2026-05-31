// Ambient generative music via the Web Audio API.
// No external assets — everything is synthesised at runtime.
export class Music {
	private timer: number | null = null;

	constructor(
		private ctx: AudioContext,
		private out: GainNode
	) {}

	private now(): number {
		return this.ctx.currentTime;
	}

	start(): void {
		if (this.timer !== null) return;
		const scale = [110, 130.81, 146.83, 164.81, 196, 220, 246.94];
		let beat = 0;
		const tick = (): void => {
			const ctx = this.ctx;
			const t = this.now();
			// bass pulse every beat
			const bass = ctx.createOscillator();
			bass.type = 'triangle';
			const root = scale[(beat % 2) * 3];
			bass.frequency.value = root / 2;
			const bg = ctx.createGain();
			bg.gain.setValueAtTime(0.0001, t);
			bg.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
			bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
			bass.connect(bg).connect(this.out);
			bass.start(t);
			bass.stop(t + 0.55);
			// sparse lead notes
			if (beat % 2 === 0) {
				const lead = ctx.createOscillator();
				lead.type = 'sawtooth';
				lead.frequency.value = scale[Math.floor(Math.random() * scale.length)];
				const lf = ctx.createBiquadFilter();
				lf.type = 'lowpass';
				lf.frequency.value = 800;
				const lg = ctx.createGain();
				lg.gain.setValueAtTime(0.0001, t);
				lg.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
				lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
				lead.connect(lf).connect(lg).connect(this.out);
				lead.start(t);
				lead.stop(t + 0.75);
			}
			beat++;
			this.timer = window.setTimeout(tick, 520);
		};
		tick();
	}

	stop(): void {
		if (this.timer !== null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}
}
