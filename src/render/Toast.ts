import { Graphics } from 'pixi.js';
import type { PixiStage } from './pixi/PixiStage.ts';
import { TextPool } from './pixi/TextPool.ts';
interface ToastItem {
	text: string;
	life: number; // seconds remaining
	total: number; // initial lifetime, for fade timing
}

// Approximate width of a Consolas glyph at a given font size (monospace).
function glyphW(size: number): number {
	return size * 0.55;
}

/**
 * Lightweight notification stack rendered in the top-right corner of the game
 * viewport via PixiJS. Messages fade out and disappear on their own.
 */
export class Toast {
	private items: ToastItem[] = [];
	private readonly maxItems = 10;
	private readonly lifetime = 3;
	private readonly gfx = new Graphics();
	private readonly text: TextPool;

	constructor(stage: PixiStage) {
		stage.toast.addChild(this.gfx);
		this.text = new TextPool(stage.toast);
	}

	// Queue a new message. Duplicates are allowed so repeated denied actions
	// keep giving feedback.
	push(text: string): void {
		this.items.unshift({ text, life: this.lifetime, total: this.lifetime });
		if (this.items.length > this.maxItems) this.items.length = this.maxItems;
	}

	update(dt: number): void {
		for (const i of this.items) i.life -= dt;
		this.items = this.items.filter((i: ToastItem): boolean => i.life > 0);
	}

	render(rightX: number): void {
		const gfx = this.gfx.clear();
		this.text.begin();
		if (this.items.length === 0) {
			this.text.end();
			return;
		}
		const pad = 10;
		const h = 30;
		const gap = 6;
		const top = 12;
		const size = 13;
		this.items.forEach((item: ToastItem, idx: number): void => {
			const alpha = Math.min(1, item.life / 0.4);
			const tw = item.text.length * glyphW(size);
			const w = tw + pad * 2 + 16;
			const x = rightX - w - 12;
			const y = top + idx * (h + gap);
			gfx.roundRect(x, y, w, h, 6).fill({ color: '#3a1b1b', alpha }).stroke({ width: 1.5, color: '#ff7a5a', alpha });
			gfx.circle(x + pad + 2, y + h / 2, 4).fill({ color: '#ffb347', alpha });
			this.text.draw(item.text, x + pad + 12, y + h / 2 + 1, { size, weight: 'bold', color: '#ffd0c0', baseline: 'middle', alpha });
		});
		this.text.end();
	}
}
