import { worldToTile } from './map/GameMap.ts';
import { TILE } from './core/types.ts';
import { viewport } from './core/viewport.ts';
import { FOG_HIDDEN } from './map/FogOfWar.ts';
import type { CursorKind } from './render/cursors.ts';
import type { Vec2 } from './core/types.ts';
import type { Game } from './core/Game.ts';
import type { Unit } from './entities/Unit.ts';

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
		this.game.stage.setCursor('arrow'); // leave no combat cursor behind for the menus
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
			// Anchor the box in world space so it stays put when the camera edge-scrolls
			// mid-drag: it then spans from the original world point to wherever the
			// cursor reaches, even past the screen edge where the drag began.
			this.selStart = this.screenToWorld({ x, y });
			this.selEnd = { ...this.selStart };
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
		// Pausing mid-drag cancels the selection box; releasing the button while
		// the pause overlay is up must not select anything underneath it.
		if (this.game.paused) {
			this.selecting = false;
			return;
		}
		if (e.button === 0 && this.selecting) {
			this.selecting = false;
			// selStart is already world-space; the release point is the freshest end.
			this.game.selectInBox(this.selStart, this.screenToWorld(this.localPoint(e)), e.shiftKey);
		}
	}

	private onMove(e: MouseEvent): void {
		const p = this.localPoint(e);
		this.mouse = p;
		this.mouseSeen = true;
		if (this.selecting) this.selEnd = this.screenToWorld(p);
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
		if (k === 'escape') {
			this.onEscape();
			return;
		}
		if (this.game.paused) return; // only Escape works under the pause overlay
		switch (k) {
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
		// Re-anchor the drag-box end under the cursor after any scroll; the mouse can
		// sit motionless at the edge, so onMove alone would leave selEnd stale.
		if (this.selecting) this.selEnd = this.screenToWorld(this.mouse);
		void TILE;
	}

	// Context-sensitive mouse cursor. Runs every frame (also while paused, so a
	// stale crosshair never survives into the pause overlay or game-over screen).
	updateCursor(): void {
		this.game.stage.setCursor(this.pickCursor());
	}

	// 'arrow' = plain game pointer; 'select' = something selectable under the
	// cursor; 'attack' = attackable enemy while own combat units are selected.
	private pickCursor(): CursorKind {
		const g = this.game;
		if (!this.mouseSeen || g.paused || g.gameOver) return 'arrow';
		const m = this.mouse;
		// sidebar, placement ghost and drag-select keep the plain arrow
		if (this.inSidebar(m.x) || g.pendingPlacement || this.selecting) return 'arrow';
		const w = this.screenToWorld(m);
		const u = g.unitAt(w);
		const b = g.buildingAt(w);
		// attack cursor only when the selection can actually shoot, and never
		// over enemies still hidden by fog (no information leak)
		if (this.game.selectedUnits.some((s: Unit): boolean => !!s.def.weapon)) {
			const enemyU = u && u.faction === 'enemy' && !g.fog.hidesUnit(u.faction, u.pos);
			const enemyB = b && b.faction === 'enemy' && !g.fog.hidesBuilding(b.faction, b.tile);
			if (enemyU || enemyB) return 'attack';
		}
		if ((u && u.faction === 'player') || (b && b.faction === 'player')) return 'select';
		// harvest fields are selectable too (they show their remaining amount)
		const tile = worldToTile(w);
		if (g.map.harvestAt(tile.x, tile.y) > 5 && g.fog.state(tile.x, tile.y) !== FOG_HIDDEN) return 'select';
		return 'arrow';
	}
}
