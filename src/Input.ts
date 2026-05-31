import { worldToTile } from './map/GameMap.ts';
import { TILE } from './core/types.ts';
import type { Vec2 } from './core/types.ts';
import type { Game } from './core/Game.ts';

export class InputController {
	private game: Game;
	mouse: Vec2 = { x: 0, y: 0 };
	private keys = new Set<string>();

	selecting = false;
	selStart: Vec2 = { x: 0, y: 0 };
	selEnd: Vec2 = { x: 0, y: 0 };

	private boundDown: (e: MouseEvent) => void;
 private boundUp: (e: MouseEvent) => void;
	private boundMove: (e: MouseEvent) => void;
	private boundKeyDown: (e: KeyboardEvent) => void;
	private boundKeyUp: (e: KeyboardEvent) => void;
	private boundContext: (e: Event) => void;
	private boundWheel: (e: WheelEvent) => void;

	constructor(game: Game) {
		this.game = game;
		this.boundDown = e => this.onDown(e);
		this.boundUp = e => this.onUp(e);
		this.boundMove = e => this.onMove(e);
		this.boundKeyDown = e => this.onKeyDown(e);
		this.boundKeyUp = e => this.keys.delete(e.key.toLowerCase());
		this.boundContext = e => e.preventDefault();
		this.boundWheel = e => this.onWheel(e);
	}

	attach(): void {
		const c = this.game.canvas;
		c.addEventListener('mousedown', this.boundDown);
		window.addEventListener('mouseup', this.boundUp);
		window.addEventListener('mousemove', this.boundMove);
		window.addEventListener('keydown', this.boundKeyDown);
		window.addEventListener('keyup', this.boundKeyUp);
		c.addEventListener('contextmenu', this.boundContext);
		c.addEventListener('wheel', this.boundWheel, { passive: false });
	}

	detach(): void {
		const c = this.game.canvas;
		c.removeEventListener('mousedown', this.boundDown);
		window.removeEventListener('mouseup', this.boundUp);
		window.removeEventListener('mousemove', this.boundMove);
		window.removeEventListener('keydown', this.boundKeyDown);
		window.removeEventListener('keyup', this.boundKeyUp);
		c.removeEventListener('contextmenu', this.boundContext);
		c.removeEventListener('wheel', this.boundWheel);
	}

	private inSidebar(x: number): boolean {
		return x >= this.game.viewW;
	}

	private screenToWorld(p: Vec2): Vec2 {
		return this.game.camera.screenToWorld(p);
	}

	// mouse
	private onDown(e: MouseEvent): void {
		const x = e.clientX;
		const y = e.clientY;
		this.mouse = { x, y };

		if (this.inSidebar(x)) {
			this.game.hud.handleClick(x, y, e.button);
			return;
		}

		// Minimap click handled by HUD even though it's in sidebar; covered above.
		if (e.button === 0) {
			// placement mode?
			if (this.game.pendingPlacement) {
				const w = this.screenToWorld({ x, y });
				this.game.confirmPlacement(worldToTile(w));
				return;
			}
			this.selecting = true;
			this.selStart = { x, y };
			this.selEnd = { x, y };
		} else if (e.button === 2) {
			if (this.game.pendingPlacement) {
				this.game.pendingPlacement = null;
				return;
			}
			const w = this.screenToWorld({ x, y });
			this.game.commandAt(w);
		}
	}

	private onUp(e: MouseEvent): void {
		if (e.button === 0 && this.selecting) {
			this.selecting = false;
			const a = this.screenToWorld(this.selStart);
			const b = this.screenToWorld({ x: e.clientX, y: e.clientY });
			this.game.selectInBox(a, b, e.shiftKey);
		}
	}

	private onMove(e: MouseEvent): void {
		this.mouse = { x: e.clientX, y: e.clientY };
		if (this.selecting) this.selEnd = { x: e.clientX, y: e.clientY };
	}

	private onWheel(e: WheelEvent): void {
		e.preventDefault();
	}

	// keyboard
	private onKeyDown(e: KeyboardEvent): void {
		const k = e.key.toLowerCase();
		this.keys.add(k);
		if (k === 'escape') {
			// While paused, Escape resumes. Otherwise it first cancels an in-progress
			// action, then a selection, and finally opens the pause dialog.
			if (this.game.paused) this.game.setPaused(false);
			else if (this.game.pendingPlacement) this.game.pendingPlacement = null;
			else if (this.game.selectedUnits.length > 0 || this.game.selectedBuilding || this.game.selectedHarvestTile) this.game.clearSelection();
			else this.game.setPaused(true);
		} else if (k === 's') for (const u of this.game.selectedUnits) u.stop();
		else if (k === 'h') for (const u of this.game.selectedUnits) if (u.isHarvester) u.orderHarvest(this.game);
	}

	// per-frame camera scroll
	update(dt: number): void {
		const cam = this.game.camera;
		const speed = 600 * dt;
		let dx = 0;
		let dy = 0;
		if (this.keys.has('arrowleft') || this.keys.has('a')) dx -= speed;
		if (this.keys.has('arrowright') || this.keys.has('d')) dx += speed;
		if (this.keys.has('arrowup') || this.keys.has('w')) dy -= speed;
		if (this.keys.has('arrowdown') || this.keys.has('s')) dy += speed;

		// edge scrolling (only inside the game viewport)
		const m = this.mouse;
		const edge = 14;
		if (!this.inSidebar(m.x)) {
			if (m.x < edge) dx -= speed;
			else if (m.x > this.game.viewW - edge) dx += speed;
			if (m.y < edge) dy -= speed;
			else if (m.y > this.game.viewH - edge) dy += speed;
		}
		if (dx !== 0 || dy !== 0) cam.move(dx, dy);
		void TILE;
	}
}
