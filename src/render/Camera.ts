import { MAP_H, MAP_W, TILE } from '../core/types.ts';
import { clamp } from '../math/vec.ts';
import type { Vec2 } from '../core/types.ts';

export class Camera {
	x = 0;
	y = 0;
	viewW = 800;
	viewH = 600;

	setViewport(w: number, h: number): void {
		this.viewW = w;
		this.viewH = h;
		this.clampToWorld();
	}

	get worldW(): number {
		return MAP_W * TILE;
	}
	get worldH(): number {
		return MAP_H * TILE;
	}

	centerOn(p: Vec2): void {
		this.x = p.x - this.viewW / 2;
		this.y = p.y - this.viewH / 2;
		this.clampToWorld();
	}

	move(dx: number, dy: number): void {
		this.x += dx;
		this.y += dy;
		this.clampToWorld();
	}

	private clampToWorld(): void {
		this.x = clamp(this.x, 0, this.worldW - this.viewW);
		this.y = clamp(this.y, 0, this.worldH - this.viewH);
		if (this.worldW < this.viewW) this.x = (this.worldW - this.viewW) / 2;
		if (this.worldH < this.viewH) this.y = (this.worldH - this.viewH) / 2;
	}

	worldToScreen(p: Vec2): Vec2 {
		return { x: p.x - this.x, y: p.y - this.y };
	}

	screenToWorld(p: Vec2): Vec2 {
		return { x: p.x + this.x, y: p.y + this.y };
	}
}
