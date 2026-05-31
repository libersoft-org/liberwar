interface ToastItem {
	text: string;
	life: number; // seconds remaining
	total: number; // initial lifetime, for fade timing
}

// Lightweight on-canvas notification stack rendered in the top-right corner of
// the game viewport. Messages fade out and disappear on their own.
export class Toast {
	private items: ToastItem[] = [];
	private readonly maxItems = 10;
	private readonly lifetime = 3;

	// Queue a new message. Duplicates are allowed: the same text re-toasts so
	// repeated denied actions keep giving feedback.
	push(text: string): void {
		this.items.unshift({ text, life: this.lifetime, total: this.lifetime });
		if (this.items.length > this.maxItems) this.items.length = this.maxItems;
	}

	update(dt: number): void {
		for (const i of this.items) i.life -= dt;
		this.items = this.items.filter((i: ToastItem): boolean => i.life > 0);
	}

	render(ctx: CanvasRenderingContext2D, rightX: number): void {
		if (this.items.length === 0) return;
		const pad = 10;
		const h = 30;
		const gap = 6;
		const top = 12;
		ctx.save();
		ctx.font = 'bold 13px Consolas, monospace';
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left';
		this.items.forEach((item: ToastItem, idx: number): void => {
			const alpha = Math.min(1, item.life / 0.4);
			const tw = ctx.measureText(item.text).width;
			const w = tw + pad * 2 + 16;
			const x = rightX - w - 12;
			const y = top + idx * (h + gap);
			const r = 6;
			ctx.globalAlpha = alpha;
			ctx.fillStyle = '#3a1b1b';
			ctx.beginPath();
			ctx.roundRect(x, y, w, h, r);
			ctx.fill();
			ctx.strokeStyle = '#ff7a5a';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r);
			ctx.stroke();
			// warning dot
			ctx.fillStyle = '#ffb347';
			ctx.beginPath();
			ctx.arc(x + pad + 2, y + h / 2, 4, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = '#ffd0c0';
			ctx.fillText(item.text, x + pad + 12, y + h / 2 + 1);
		});
		ctx.restore();
	}
}
