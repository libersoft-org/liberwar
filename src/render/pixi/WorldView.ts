import { Container, Graphics } from 'pixi.js';
import { BUILDINGS } from '../../core/config.ts';
import { FOG_EXPLORED, FOG_HIDDEN } from '../../map/FogOfWar.ts';
import { HARVEST_PER_TILE } from '../../core/config.ts';
import { TILE } from '../../core/types.ts';
import type { Vec2 } from '../../core/types.ts';
import type { Game } from '../../core/Game.ts';
import type { Unit } from '../../entities/Unit.ts';
import type { Building } from '../../entities/Building.ts';
import type { PixiStage } from './PixiStage.ts';
import { TextPool } from './TextPool.ts';
import { buildBuildingView, buildUnitView, drawTerrainTile } from './entitySprites.ts';
import type { BuildingView, UnitView } from './entitySprites.ts';
const SELECT = 'rgb(120,255,140)';

/**
 * Retained PixiJS rendering of the game world. Long-lived entities (terrain,
 * buildings, units) are persistent display objects synced each frame; inherently
 * dynamic layers (harvest dots, fog, projectiles, effects, overlays) are cheap
 * immediate-mode Graphics cleared and redrawn per frame.
 */
export class WorldView {
	private readonly terrainLayer = new Container();
	private readonly groundGfx = new Graphics();
	private readonly buildingLayer = new Container();
	private readonly unitLayer = new Container();
	private readonly fxAdd = new Graphics();
	private readonly fxNormal = new Graphics();
	private readonly fogGfx = new Graphics();
	private readonly overlayGfx = new Graphics();
	private readonly overlayText: TextPool;

	private readonly unitViews = new Map<Unit, UnitView>();
	private readonly buildingViews = new Map<Building, BuildingView>();

	constructor(
		private readonly game: Game,
		private readonly stage: PixiStage
	) {
		const textLayer = new Container();
		this.overlayText = new TextPool(textLayer);
		this.fxAdd.blendMode = 'add';
		stage.world.addChild(this.terrainLayer, this.groundGfx, this.buildingLayer, this.unitLayer, this.fxNormal, this.fxAdd, this.fogGfx, this.overlayGfx, textLayer);
		this.buildTerrain();
	}

	private buildTerrain(): void {
		const g = new Graphics();
		const map = this.game.map;
		for (let ty = 0; ty < map.h; ty++) {
			for (let tx = 0; tx < map.w; tx++) {
				drawTerrainTile(g, map.terrain[ty]![tx]!, tx * TILE, ty * TILE, map.variation[ty]![tx]!);
			}
		}
		this.terrainLayer.addChild(g);
	}

	render(): void {
		const g = this.game;
		const cam = g.camera;
		const shake = g.shakeOffset;
		this.stage.world.x = -cam.x + shake.x;
		this.stage.world.y = -cam.y + shake.y;

		const x0 = Math.max(0, Math.floor(cam.x / TILE));
		const y0 = Math.max(0, Math.floor(cam.y / TILE));
		const x1 = Math.min(g.mapTiles.w - 1, Math.ceil((cam.x + g.viewW) / TILE));
		const y1 = Math.min(g.mapTiles.h - 1, Math.ceil((cam.y + g.viewH) / TILE));

		this.renderHarvest(x0, y0, x1, y1);
		this.syncBuildings();
		this.syncUnits();
		this.renderProjectiles();
		this.renderEffects();
		this.renderFog(x0, y0, x1, y1);
		this.renderOverlays();
	}

	// ---- dynamic ground (harvest dots) --------------------------------
	private renderHarvest(x0: number, y0: number, x1: number, y1: number): void {
		const g = this.game;
		const gfx = this.groundGfx.clear();
		for (let ty = y0; ty <= y1; ty++) {
			for (let tx = x0; tx <= x1; tx++) {
				if (g.fog.state(tx, ty) === FOG_HIDDEN) continue;
				const amount = g.map.harvest[ty]![tx]!;
				if (amount > 5) this.drawHarvest(gfx, tx * TILE, ty * TILE, amount);
			}
		}
	}

	private drawHarvest(gfx: Graphics, px: number, py: number, amount: number): void {
		const frac = Math.min(1, amount / HARVEST_PER_TILE);
		const n = Math.max(1, Math.round(frac * 10));
		let seed = (px * 73856093) ^ (py * 19349663);
		const rnd = (): number => {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			return (seed % 1000) / 1000;
		};
		const c = 200 + Math.floor(frac * 55);
		for (let i = 0; i < n; i++) {
			const ox = px + 4 + rnd() * (TILE - 8);
			const oy = py + 4 + rnd() * (TILE - 8);
			const s = 2 + rnd() * 3;
			gfx.circle(ox, oy, s).fill(`rgb(${c},${Math.floor(c * 0.85)},40)`);
			gfx.rect(ox - 1, oy - 1, 1.5, 1.5).fill({ color: 'rgb(255,240,150)', alpha: 0.6 });
		}
	}

	// ---- buildings ----------------------------------------------------
	private syncBuildings(): void {
		const g = this.game;
		const seen = new Set<Building>();
		for (const b of g.buildings) {
			seen.add(b);
			let view = this.buildingViews.get(b);
			if (!view) {
				view = buildBuildingView(b);
				this.buildingViews.set(b, view);
				this.buildingLayer.addChild(view.container);
			}
			view.container.visible = !g.fog.hidesBuilding(b.faction, b.tile);
			if (!view.container.visible) continue;

			const w = b.def.w * TILE;
			const h = b.def.h * TILE;
			if (b.complete) {
				view.body.mask = null;
				view.shade.visible = false;
				view.scaffold.visible = false;
				view.mask.visible = false;
			} else {
				view.body.mask = view.mask;
				view.mask.visible = true;
				view.shade.visible = true;
				view.scaffold.visible = true;
				view.mask
					.clear()
					.rect(0, h * (1 - b.buildProgress), w, h * b.buildProgress)
					.fill('#ffffff');
			}
			if (view.turret) view.turret.rotation = b.turretAngle;
		}
		for (const [b, view] of this.buildingViews) {
			if (seen.has(b)) continue;
			view.container.destroy({ children: true });
			this.buildingViews.delete(b);
		}
	}

	// ---- units --------------------------------------------------------
	private syncUnits(): void {
		const g = this.game;
		const seen = new Set<Unit>();
		for (const u of g.units) {
			seen.add(u);
			let view = this.unitViews.get(u);
			if (!view) {
				view = buildUnitView(u);
				this.unitViews.set(u, view);
				this.unitLayer.addChild(view.container);
			}
			view.container.visible = !g.fog.hidesUnit(u.faction, u.pos);
			if (!view.container.visible) continue;
			view.container.x = u.pos.x;
			view.container.y = u.pos.y;
			if (view.body) view.body.rotation = u.facing;
			if (view.turret) view.turret.rotation = u.turret;
		}
		for (const [u, view] of this.unitViews) {
			if (seen.has(u)) continue;
			view.container.destroy({ children: true });
			this.unitViews.delete(u);
		}
	}

	// ---- projectiles --------------------------------------------------
	private renderProjectiles(): void {
		const g = this.game;
		const gfx = this.fxNormal.clear();
		for (const p of g.projectiles) {
			if (!g.fog.isVisibleWorld(p.pos)) continue;
			if (p.kind === 'rocket') {
				for (let i = 0; i < p.trail.length; i++) {
					const tr = p.trail[i]!;
					const a = (i / p.trail.length) * 0.5;
					gfx.circle(tr.x, tr.y, 2 + i * 0.3).fill({ color: 'rgb(180,180,180)', alpha: a });
				}
				const cos = Math.cos(p.angle);
				const sin = Math.sin(p.angle);
				// body rectangle, rotated: approximate with a short thick line
				gfx
					.moveTo(p.pos.x - cos * 5, p.pos.y - sin * 5)
					.lineTo(p.pos.x + cos * 5, p.pos.y + sin * 5)
					.stroke({ width: 4, color: '#d8d8d8' });
				gfx.circle(p.pos.x - cos * 5, p.pos.y - sin * 5, 1.6).fill('#ff6a2b');
			} else {
				gfx
					.moveTo(p.pos.x, p.pos.y)
					.lineTo(p.pos.x - Math.cos(p.angle) * 7, p.pos.y - Math.sin(p.angle) * 7)
					.stroke({ width: 2, color: '#ffe27a' });
			}
		}
	}

	// ---- effects ------------------------------------------------------
	private renderEffects(): void {
		const g = this.game;
		const add = this.fxAdd.clear();
		for (const e of g.effects) {
			if (e.kind === 'sell') continue;
			for (const part of e.particles) {
				if (part.life <= 0) continue;
				const a = Math.max(0, part.life / part.maxLife);
				add.circle(part.x, part.y, part.size).fill({ color: part.color, alpha: a });
			}
		}
		// sell coins render on the normal fx layer (already cleared by projectiles)
		const normal = this.fxNormal;
		for (const e of g.effects) {
			if (e.kind !== 'sell') continue;
			for (const part of e.particles) {
				if (part.life <= 0) continue;
				const a = Math.max(0, part.life / part.maxLife);
				normal.circle(part.x, part.y, part.size).fill({ color: part.color, alpha: a }).stroke({ width: 1.5, color: '#a9781f', alpha: a });
				normal.circle(part.x, part.y, part.size * 0.62).stroke({ width: 1, color: '#e8b94d', alpha: a });
			}
		}
	}

	// ---- fog ----------------------------------------------------------
	private renderFog(x0: number, y0: number, x1: number, y1: number): void {
		const gfx = this.fogGfx.clear();
		const g = this.game;
		if (!g.fog.enabled) return;
		for (let ty = y0; ty <= y1; ty++) {
			for (let tx = x0; tx <= x1; tx++) {
				const s = g.fog.state(tx, ty);
				if (s === FOG_HIDDEN) gfx.rect(tx * TILE, ty * TILE, TILE, TILE).fill('#05080a');
				else if (s === FOG_EXPLORED) gfx.rect(tx * TILE, ty * TILE, TILE, TILE).fill({ color: '#05080a', alpha: 0.5 });
			}
		}
	}

	// ---- overlays (health bars, selection, rally, harvest tile) -------
	private renderOverlays(): void {
		const g = this.game;
		const gfx = this.overlayGfx.clear();
		this.overlayText.begin();

		// selection rings under unit overlays
		for (const u of g.selectedUnits) {
			gfx.circle(u.pos.x, u.pos.y, u.radius + 4).stroke({ width: 1.5, color: SELECT, alpha: 0.9 });
		}

		for (const u of g.units) {
			if (g.fog.hidesUnit(u.faction, u.pos)) continue;
			const sel = g.selectedUnits.includes(u);
			if (sel || u.hp < u.maxHp) this.healthBar(gfx, u.pos, u.radius, u.hp / u.maxHp, u.faction === 'player');
			if (u.isHarvester && (sel || u.harvestLoad > 0)) {
				this.bar(gfx, u.pos.x - (u.radius + 2), u.pos.y - u.radius - 3, u.radius * 2 + 4, 3, u.harvestLoad / g.harvesterCapacity, '#e0b020');
			}
		}

		for (const b of g.buildings) {
			if (g.fog.hidesBuilding(b.faction, b.tile)) continue;
			const sel = g.selectedBuilding === b;
			const w = b.def.w * TILE;
			if (sel || b.hp < b.maxHp || !b.complete) {
				this.healthBarWide(gfx, b.pos.x, b.tile.y * TILE - 2, w - 6, b.hp / b.maxHp, b.faction === 'player');
			}
			if (sel) {
				gfx.rect(b.tile.x * TILE + 1, b.tile.y * TILE + 1, w - 2, b.def.h * TILE - 2).stroke({ width: 2, color: SELECT, alpha: 0.9 });
				if (b.rally) gfx.moveTo(b.pos.x, b.pos.y).lineTo(b.rally.x, b.rally.y).stroke({ width: 1, color: SELECT, alpha: 0.5 });
			}
		}

		this.renderSelectedHarvestTile(gfx);
		this.overlayText.end();
	}

	private renderSelectedHarvestTile(gfx: Graphics): void {
		const g = this.game;
		const tile = g.selectedHarvestTile;
		if (!tile) return;
		const max = g.map.harvestMaxAt(tile.x, tile.y);
		if (max <= 0) return;
		const amount = g.map.harvestAt(tile.x, tile.y);
		const x0 = tile.x * TILE;
		const y0 = tile.y * TILE;
		gfx.rect(x0 + 1, y0 + 1, TILE - 2, TILE - 2).stroke({ width: 2, color: SELECT, alpha: 0.9 });
		this.bar(gfx, x0 + 2, y0 - 6, TILE - 4, 4, amount / max, '#e0b020');
		this.overlayText.draw(String(Math.round(amount)), x0 + TILE / 2, y0 + TILE / 2, {
			size: 11,
			weight: 'bold',
			family: 'sans-serif',
			color: '#ffe9a0',
			align: 'center',
			baseline: 'middle',
			stroke: { color: 'rgba(0,0,0,0.8)', width: 3 },
		});
	}

	private healthBar(gfx: Graphics, pos: Vec2, radius: number, frac: number, friendly: boolean): void {
		const w = radius * 2 + 4;
		this.statusBar(gfx, pos.x - w / 2, pos.y - radius - 8, w, 3, frac, friendly);
	}
	private healthBarWide(gfx: Graphics, cx: number, topY: number, w: number, frac: number, friendly: boolean): void {
		this.statusBar(gfx, cx - w / 2, topY - 4, w, 4, frac, friendly);
	}
	private statusBar(gfx: Graphics, x: number, y: number, w: number, h: number, frac: number, friendly: boolean): void {
		const c = frac > 0.5 ? (friendly ? '#5dff6a' : '#ff7a4d') : frac > 0.25 ? '#ffd23d' : '#ff3d3d';
		this.bar(gfx, x, y, w, h, frac, c);
	}
	private bar(gfx: Graphics, x: number, y: number, w: number, h: number, frac: number, fill: string): void {
		gfx.rect(x - 1, y - 1, w + 2, h + 2).fill({ color: '#000000', alpha: 0.7 });
		gfx.rect(x, y, w * Math.max(0, Math.min(1, frac)), h).fill(fill);
	}

	// ---- screen-space overlays (selection box, placement preview) -----
	renderScreen(): void {
		const g = this.game;
		const layer = this.stage.screen;
		let gfx = layer.children[0] as Graphics | undefined;
		if (!gfx) {
			gfx = new Graphics();
			layer.addChild(gfx);
		}
		gfx.clear();

		const input = g.input;
		if (input.selecting) {
			const a = input.selStart;
			const b = input.selEnd;
			const x = Math.min(a.x, b.x);
			const y = Math.min(a.y, b.y);
			const w = Math.abs(a.x - b.x);
			const h = Math.abs(a.y - b.y);
			gfx.rect(x, y, w, h).fill({ color: SELECT, alpha: 0.12 }).stroke({ width: 1, color: SELECT, alpha: 0.9 });
		}

		if (g.pendingPlacement) {
			const def = BUILDINGS[g.pendingPlacement];
			const m = g.input.mouse;
			if (m.x < g.viewW) {
				const world = g.camera.screenToWorld(m);
				const tx = Math.floor(world.x / TILE);
				const ty = Math.floor(world.y / TILE);
				const ok = g.canPlayerPlace(tx, ty, def.w, def.h, g.pendingPlacement);
				const sx = tx * TILE - g.camera.x;
				const sy = ty * TILE - g.camera.y;
				gfx.rect(sx, sy, def.w * TILE, def.h * TILE).fill({ color: ok ? 'rgb(90,255,120)' : 'rgb(255,80,70)', alpha: ok ? 0.25 : 0.3 });
				gfx.rect(sx, sy, def.w * TILE, def.h * TILE).stroke({ width: 2, color: ok ? 'rgb(90,255,120)' : 'rgb(255,80,70)' });
			}
		}
	}
}
