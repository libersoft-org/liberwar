import { drawBar, drawBuilding, drawHarvest, drawTerrainTile, drawUnit } from './sprites.ts';
import { BUILDINGS } from '../core/config.ts';
import { FOG_EXPLORED, FOG_HIDDEN } from '../map/FogOfWar.ts';
import { TILE } from '../core/types.ts';
import type { Vec2 } from '../core/types.ts';
import type { Game } from '../core/Game.ts';
import type { Unit } from '../entities/Unit.ts';

// RGB triple of the selection/placement highlight green, for rgba() strings.
const SELECT_RGB = '120,255,140';

export class Renderer {
	private game: Game;
	constructor(game: Game) {
		this.game = game;
	}

	render(): void {
		const g = this.game;
		const ctx = g.ctx;
		const cam = g.camera;
		const vw = g.viewW;
		const vh = g.viewH;

		ctx.save();
		ctx.beginPath();
		ctx.rect(0, 0, vw, vh);
		ctx.clip();

		ctx.fillStyle = '#05080a';
		ctx.fillRect(0, 0, vw, vh);

		const shake = g.shakeOffset;
		ctx.translate(-cam.x + shake.x, -cam.y + shake.y);

		// visible tile range
		const x0 = Math.max(0, Math.floor(cam.x / TILE));
		const y0 = Math.max(0, Math.floor(cam.y / TILE));
		const x1 = Math.min(g.mapTiles.w - 1, Math.ceil((cam.x + vw) / TILE));
		const y1 = Math.min(g.mapTiles.h - 1, Math.ceil((cam.y + vh) / TILE));

		this.drawTerrain(ctx, x0, y0, x1, y1);
		this.drawBuildings(ctx);
		this.drawUnits(ctx);
		this.drawProjectiles(ctx);
		this.drawEffects(ctx);
		this.drawFog(ctx, x0, y0, x1, y1);
		this.drawOverlays(ctx);

		ctx.restore();

		this.drawSelectionBox(ctx);
		this.drawPlacementPreview(ctx);
	}

	private drawTerrain(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
		const g = this.game;
		for (let ty = y0; ty <= y1; ty++) {
			for (let tx = x0; tx <= x1; tx++) {
				if (g.fog.state(tx, ty) === FOG_HIDDEN) continue;
				drawTerrainTile(ctx, g.map.terrain[ty][tx], tx * TILE, ty * TILE, g.map.variation[ty][tx]);
				if (g.map.harvest[ty][tx] > 5) drawHarvest(ctx, tx * TILE, ty * TILE, g.map.harvest[ty][tx]);
			}
		}
	}

	private drawBuildings(ctx: CanvasRenderingContext2D): void {
		const g = this.game;
		for (const b of g.buildings) {
			// own always; enemy if explored
			if (g.fog.hidesBuilding(b.faction, b.tile)) continue;
			drawBuilding(ctx, b);
		}
	}

	private drawUnits(ctx: CanvasRenderingContext2D): void {
		const g = this.game;
		// selection rings first (under units)
		for (const u of g.selectedUnits) this.drawSelectRing(ctx, u);
		for (const u of g.units) {
			if (g.fog.hidesUnit(u.faction, u.pos)) continue;
			drawUnit(ctx, u);
		}
	}

	private drawSelectRing(ctx: CanvasRenderingContext2D, u: Unit): void {
		ctx.strokeStyle = `rgba(${SELECT_RGB},0.9)`;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.arc(u.pos.x, u.pos.y, u.radius + 4, 0, Math.PI * 2);
		ctx.stroke();
	}

	private drawProjectiles(ctx: CanvasRenderingContext2D): void {
		const g = this.game;
		for (const p of g.projectiles) {
			if (!g.fog.isVisibleWorld(p.pos)) continue;
			if (p.kind === 'rocket') {
				// smoke trail
				for (let i = 0; i < p.trail.length; i++) {
					const t = p.trail[i];
					const a = (i / p.trail.length) * 0.5;
					ctx.fillStyle = `rgba(180,180,180,${a})`;
					ctx.beginPath();
					ctx.arc(t.x, t.y, 2 + i * 0.3, 0, Math.PI * 2);
					ctx.fill();
				}
				ctx.save();
				ctx.translate(p.pos.x, p.pos.y);
				ctx.rotate(p.angle);
				ctx.fillStyle = '#d8d8d8';
				ctx.fillRect(-5, -2, 10, 4);
				ctx.fillStyle = '#ff6a2b';
				ctx.fillRect(-7, -1.5, 3, 3);
				ctx.restore();
			} else {
				ctx.strokeStyle = '#ffe27a';
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(p.pos.x, p.pos.y);
				ctx.lineTo(p.pos.x - Math.cos(p.angle) * 7, p.pos.y - Math.sin(p.angle) * 7);
				ctx.stroke();
			}
		}
	}

	private drawEffects(ctx: CanvasRenderingContext2D): void {
		const g = this.game;
		ctx.save();
		ctx.globalCompositeOperation = 'lighter';
		for (const e of g.effects) {
			for (const part of e.particles) {
				if (part.life <= 0) continue;
				const a = Math.max(0, part.life / part.maxLife);
				ctx.globalAlpha = a;
				ctx.fillStyle = part.color;
				ctx.beginPath();
				ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
				ctx.fill();
			}
		}
		ctx.restore();
		ctx.globalAlpha = 1;
	}

	private drawFog(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
		const g = this.game;
		if (!g.fog.enabled) return;
		for (let ty = y0; ty <= y1; ty++) {
			for (let tx = x0; tx <= x1; tx++) {
				const s = g.fog.state(tx, ty);
				if (s === FOG_HIDDEN) {
					ctx.fillStyle = '#05080a';
					ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
				} else if (s === FOG_EXPLORED) {
					ctx.fillStyle = 'rgba(5,8,10,0.5)';
					ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
				}
			}
		}
	}

	private drawOverlays(ctx: CanvasRenderingContext2D): void {
		const g = this.game;
		// health bars for damaged or selected visible entities
		for (const u of g.units) {
			if (g.fog.hidesUnit(u.faction, u.pos)) continue;
			const sel = g.selectedUnits.includes(u);
			if (sel || u.hp < u.maxHp) this.healthBar(ctx, u.pos, u.radius, u.hp / u.maxHp, u.faction === 'player');
			// harvest load bar for harvesters (second bar under the health bar)
			if (u.isHarvester && (sel || u.harvestLoad > 0)) {
				const frac = u.harvestLoad / g.harvesterCapacity;
				this.harvestBar(ctx, u.pos, u.radius, frac);
			}
		}
		for (const b of g.buildings) {
			if (g.fog.hidesBuilding(b.faction, b.tile)) continue;
			const sel = g.selectedBuilding === b;
			const w = b.def.w * TILE;
			if (sel || b.hp < b.maxHp || !b.complete) {
				const top = { x: b.pos.x, y: b.tile.y * TILE - 2 };
				this.healthBarWide(ctx, top, w - 6, b.hp / b.maxHp, b.faction === 'player');
			}
			if (sel) {
				ctx.strokeStyle = `rgba(${SELECT_RGB},0.9)`;
				ctx.lineWidth = 2;
				ctx.strokeRect(b.tile.x * TILE + 1, b.tile.y * TILE + 1, w - 2, b.def.h * TILE - 2);
				if (b.rally) {
					ctx.strokeStyle = `rgba(${SELECT_RGB},0.5)`;
					ctx.setLineDash([4, 4]);
					ctx.beginPath();
					ctx.moveTo(b.pos.x, b.pos.y);
					ctx.lineTo(b.rally.x, b.rally.y);
					ctx.stroke();
					ctx.setLineDash([]);
				}
			}
		}
		this.drawSelectedHarvestTile(ctx);
	}

	private drawSelectedHarvestTile(ctx: CanvasRenderingContext2D): void {
		const g = this.game;
		const tile = g.selectedHarvestTile;
		if (!tile) return;
		const max = g.map.harvestMaxAt(tile.x, tile.y);
		if (max <= 0) return;
		const amount = g.map.harvestAt(tile.x, tile.y);
		const frac = amount / max;
		const x0 = tile.x * TILE;
		const y0 = tile.y * TILE;
		// selection outline around the tile
		ctx.strokeStyle = `rgba(${SELECT_RGB},0.9)`;
		ctx.lineWidth = 2;
		ctx.strokeRect(x0 + 1, y0 + 1, TILE - 2, TILE - 2);
		// remaining-harvest bar above the tile
		drawBar(ctx, x0 + 2, y0 - 6, TILE - 4, 4, frac, '#e0b020');
		// absolute remaining amount in the centre of the tile
		ctx.save();
		ctx.font = 'bold 11px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const label = String(Math.round(amount));
		const cx = x0 + TILE / 2;
		const cy = y0 + TILE / 2;
		ctx.lineWidth = 3;
		ctx.strokeStyle = 'rgba(0,0,0,0.8)';
		ctx.strokeText(label, cx, cy);
		ctx.fillStyle = '#ffe9a0';
		ctx.fillText(label, cx, cy);
		ctx.restore();
	}

	private healthBar(ctx: CanvasRenderingContext2D, pos: Vec2, radius: number, frac: number, friendly: boolean): void {
		const w = radius * 2 + 4;
		const x = pos.x - w / 2;
		const y = pos.y - radius - 8;
		this.bar(ctx, x, y, w, 3, frac, friendly);
	}
	private harvestBar(ctx: CanvasRenderingContext2D, pos: Vec2, radius: number, frac: number): void {
		const w = radius * 2 + 4;
		const x = pos.x - w / 2;
		const y = pos.y - radius - 3; // just below the health bar
		drawBar(ctx, x, y, w, 3, frac, '#e0b020');
	}
	private healthBarWide(ctx: CanvasRenderingContext2D, top: Vec2, w: number, frac: number, friendly: boolean): void {
		this.bar(ctx, top.x - w / 2, top.y - 4, w, 4, frac, friendly);
	}
	private bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, friendly: boolean): void {
		const c = frac > 0.5 ? (friendly ? '#5dff6a' : '#ff7a4d') : frac > 0.25 ? '#ffd23d' : '#ff3d3d';
		drawBar(ctx, x, y, w, h, frac, c);
	}

	private drawSelectionBox(ctx: CanvasRenderingContext2D): void {
		const input = this.game.input;
		if (!input.selecting) return;
		const a = input.selStart;
		const b = input.selEnd;
		const x = Math.min(a.x, b.x);
		const y = Math.min(a.y, b.y);
		const w = Math.abs(a.x - b.x);
		const h = Math.abs(a.y - b.y);
		ctx.fillStyle = `rgba(${SELECT_RGB},0.12)`;
		ctx.fillRect(x, y, w, h);
		ctx.strokeStyle = `rgba(${SELECT_RGB},0.9)`;
		ctx.lineWidth = 1;
		ctx.strokeRect(x + 0.5, y + 0.5, w, h);
	}

	private drawPlacementPreview(ctx: CanvasRenderingContext2D): void {
		const g = this.game;
		if (!g.pendingPlacement) return;
		const def = BUILDINGS[g.pendingPlacement];
		const m = g.input.mouse;
		if (m.x >= g.viewW) return;
		const world = g.camera.screenToWorld(m);
		const tx = Math.floor(world.x / TILE);
		const ty = Math.floor(world.y / TILE);
		const ok = g.canPlayerPlace(tx, ty, def.w, def.h);
		const sx = tx * TILE - g.camera.x;
		const sy = ty * TILE - g.camera.y;
		ctx.fillStyle = ok ? 'rgba(90,255,120,0.25)' : 'rgba(255,80,70,0.3)';
		ctx.fillRect(sx, sy, def.w * TILE, def.h * TILE);
		ctx.strokeStyle = ok ? '#5dff6a' : '#ff5a4d';
		ctx.lineWidth = 2;
		ctx.strokeRect(sx + 1, sy + 1, def.w * TILE - 2, def.h * TILE - 2);
		// grid cells
		ctx.strokeStyle = 'rgba(255,255,255,0.15)';
		ctx.lineWidth = 1;
		for (let i = 0; i <= def.w; i++) {
			ctx.beginPath();
			ctx.moveTo(sx + i * TILE, sy);
			ctx.lineTo(sx + i * TILE, sy + def.h * TILE);
			ctx.stroke();
		}
		for (let j = 0; j <= def.h; j++) {
			ctx.beginPath();
			ctx.moveTo(sx, sy + j * TILE);
			ctx.lineTo(sx + def.w * TILE, sy + j * TILE);
			ctx.stroke();
		}
	}
}
