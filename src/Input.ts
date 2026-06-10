import { worldToTile } from './map/GameMap.ts';
import { TILE } from './core/types.ts';
import { viewport } from './core/viewport.ts';
import type { Vec2 } from './core/types.ts';
import type { Game } from './core/Game.ts';

export class InputController {
	private game: Game;
	mouse: Vec2 = { x: 0, y: 0 };
	// true once a real mousemove arrived; until then the placeholder {0,0}
	// position must not drive edge scrolling (camera would creep top-left)
	private mouseSeen = false;
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
	private boundBlur: () => void;

	constructor(game: Game) {
		this.game = game;
		this.boundDown = (e: MouseEvent): void => this.onDown(e);
		this.boundUp = (e: MouseEvent): void => this.onUp(e);
		this.boundMove = (e: MouseEvent): void => this.onMove(e);
		this.boundKeyDown = (e: KeyboardEvent): void => this.onKeyDown(e);
		this.boundKeyUp = (e: KeyboardEvent): void => {
			this.keys.delete(e.key.toLowerCase());
		};
		this.boundContext = (e: Event): void => e.preventDefault();
		this.boundWheel = (e: WheelEvent): void => this.onWheel(e);
		// keyup never arrives for keys held across alt-tab; forget them on blur
		this.boundBlur = (): void => this.keys.clear();
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
		window.addEventListener('blur', this.boundBlur);
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
		window.removeEventListener('blur', this.boundBlur);
		this.keys.clear();
	}

	private inSidebar(x: number): boolean {
		return x >= this.game.viewW;
	}

	private screenToWorld(p: Vec2): Vec2 {
		return this.game.camera.screenToWorld(p);
	}

	// Convert a window-space mouse event into the canvas' logical coordinate
	// space. The whole scene is uniformly scaled by `viewport.scale`, so we undo
	// that scale (the canvas itself fills the window, top-left aligned).
	private localPoint(e: MouseEvent): Vec2 {
		const r = this.game.canvas.getBoundingClientRect();
		const s = viewport.scale || 1;
		return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
	}

	// mouse
	private onDown(e: MouseEvent): void {
		// While paused the Pixi pause overlay owns all input; ignore game clicks.
		if (this.game.paused) return;
		const { x, y } = this.localPoint(e);
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
			const b = this.screenToWorld(this.localPoint(e));
			this.game.selectInBox(a, b, e.shiftKey);
		}
	}

	private onMove(e: MouseEvent): void {
		const p = this.localPoint(e);
		this.mouse = p;
		this.mouseSeen = true;
		if (this.selecting) this.selEnd = p;
	}

	private onWheel(e: WheelEvent): void {
		e.preventDefault();
		if (this.game.paused) return;
		const p = this.localPoint(e);
		if (this.inSidebar(p.x)) return;
		// zoom toward the cursor; ~1.13x per wheel notch
		this.game.camera.zoomBy(Math.exp(-e.deltaY * 0.0012), p);
	}

	// keyboard
	private onKeyDown(e: KeyboardEvent): void {
		const k = e.key.toLowerCase();
		this.keys.add(k);
		switch (k) {
			case 'escape':
				this.onEscape();
				break;
			case 'h':
				this.game.homeView();
				break;
			case '+':
			case '=':
				this.game.camera.zoomBy(1.2);
				break;
			case '-':
				this.game.camera.zoomBy(1 / 1.2);
				break;
		}
	}

	// While paused, Escape resumes. Otherwise it first cancels an in-progress
	// action, then a selection, and finally opens the pause dialog.
	private onEscape(): void {
		if (this.game.paused) this.game.setPaused(false);
		else if (this.game.pendingPlacement) this.game.pendingPlacement = null;
		else if (this.game.selectedUnits.length > 0 || this.game.selectedBuilding || this.game.selectedHarvestTile) this.game.clearSelection();
		else this.game.setPaused(true);
	}

	// per-frame camera scroll
	update(dt: number): void {
		const cam = this.game.camera;
		// constant on-screen speed regardless of zoom
		const speed = (600 * dt) / cam.zoom;
		let dx = 0;
		let dy = 0;
		if (this.keys.has('arrowleft') || this.keys.has('a')) dx -= speed;
		if (this.keys.has('arrowright') || this.keys.has('d')) dx += speed;
		if (this.keys.has('arrowup') || this.keys.has('w')) dy -= speed;
		if (this.keys.has('arrowdown') || this.keys.has('s')) dy += speed;

		// edge scrolling (only inside the game viewport, and only once the real
		// cursor position is known)
		const m = this.mouse;
		const edge = 14;
		if (this.mouseSeen && !this.inSidebar(m.x)) {
			if (m.x < edge) dx -= speed;
			else if (m.x > this.game.viewW - edge) dx += speed;
			if (m.y < edge) dy -= speed;
			else if (m.y > this.game.viewH - edge) dy += speed;
		}
		if (dx !== 0 || dy !== 0) cam.move(dx, dy);
		void TILE;
	}
}
