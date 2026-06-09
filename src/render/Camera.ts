import { MAP_H, MAP_W, TILE } from '../core/types.ts';
import { clamp } from '../math/vec.ts';
import type { Vec2 } from '../core/types.ts';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

export class Camera {
	x = 0;
	y = 0;
	viewW = 800;
	viewH = 600;
	// world-to-screen magnification; 1 = native pixels
	zoom = 1;

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
	// visible world area (shrinks as zoom grows)
	get worldViewW(): number {
		return this.viewW / this.zoom;
	}
	get worldViewH(): number {
		return this.viewH / this.zoom;
	}

	centerOn(p: Vec2): void {
		this.x = p.x - this.worldViewW / 2;
		this.y = p.y - this.worldViewH / 2;
		this.clampToWorld();
	}

	move(dx: number, dy: number): void {
		this.x += dx;
		this.y += dy;
		this.clampToWorld();
	}

	// Multiplies zoom, keeping the world point under `anchor` (logical screen
	// coords, defaults to the viewport centre) fixed on screen.
	zoomBy(factor: number, anchor?: Vec2): void {
		const nz = clamp(this.zoom * factor, ZOOM_MIN, ZOOM_MAX);
		if (nz === this.zoom) return;
		const a = anchor ?? { x: this.viewW / 2, y: this.viewH / 2 };
		const wx = a.x / this.zoom + this.x;
		const wy = a.y / this.zoom + this.y;
		this.zoom = nz;
		this.x = wx - a.x / this.zoom;
		this.y = wy - a.y / this.zoom;
		this.clampToWorld();
	}

	private clampToWorld(): void {
		const vw = this.worldViewW;
		const vh = this.worldViewH;
		this.x = clamp(this.x, 0, this.worldW - vw);
		this.y = clamp(this.y, 0, this.worldH - vh);
		if (this.worldW < vw) this.x = (this.worldW - vw) / 2;
		if (this.worldH < vh) this.y = (this.worldH - vh) / 2;
	}

	worldToScreen(p: Vec2): Vec2 {
		return { x: (p.x - this.x) * this.zoom, y: (p.y - this.y) * this.zoom };
	}

	screenToWorld(p: Vec2): Vec2 {
		return { x: p.x / this.zoom + this.x, y: p.y / this.zoom + this.y };
	}
}
