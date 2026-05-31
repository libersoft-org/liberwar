import { BUILD_ORDER, BUILDINGS, TRAIN_ORDER, UNITS } from '../core/config.ts';
import { FOG_HIDDEN } from '../map/FogOfWar.ts';
import { TILE } from '../core/types.ts';
import type { BuildingTypeId, UnitTypeId } from '../core/types.ts';
import type { Game } from '../core/Game.ts';
import type { UnitSlot } from '../systems/ProductionSystem.ts';
import { t } from '../lang/lang.ts';
import { drawBar } from './sprites.ts';
interface Btn {
	kind: 'structure' | 'unit';
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

export class HUD {
	private game: Game;
	private buttons: Btn[] = [];
	private minimap = { x: 6, y: 56, size: 200 };
	private statsH = 50;
	private visibleUnitsKey = '';
	private sellBtn: { x: number; y: number; w: number; h: number } | null = null;

	constructor(game: Game) {
		this.game = game;
		this.layout();
	}

	layout(): void {
		const g = this.game;
		const sx = g.viewW; // sidebar left edge
		const pad = 6;
		const w = g.sidebarW - pad * 2;
		this.minimap = { x: sx + pad, y: this.statsH + pad, size: w };

		this.buttons = [];
		const cols = 3;
		const gap = 4;
		const bw = (w - gap * (cols - 1)) / cols;
		const bh = 74;
		let y = this.minimap.y + this.minimap.size + 24; // leave room for "STRUCTURES" label
		const place = (kind: 'structure' | 'unit', ids: string[], startY: number): number => {
			let yy = startY;
			ids.forEach((id: string, i: number): void => {
				const col = i % cols;
				if (col === 0 && i > 0) yy += bh + gap;
				this.buttons.push({
					kind,
					id,
					x: sx + pad + col * (bw + gap),
					y: yy,
					w: bw,
					h: bh,
				});
			});
			return yy + bh + gap;
		};
		const units = this.visibleUnitIds();
		this.visibleUnitsKey = units.join(',');
		y = place('structure', BUILD_ORDER, y);
		y += 24; // label gap for "UNITS"
		place('unit', units, y);
	}

	// Units whose producing building the player currently owns.
	private visibleUnitIds(): UnitTypeId[] {
		return TRAIN_ORDER.filter((id: UnitTypeId): boolean => this.game.hasBuilding('player', UNITS[id].from));
	}

	// rendering
	render(): void {
		const g = this.game;
		const ctx = g.ctx;
		const sx = g.viewW;
		const w = g.sidebarW;
		const h = g.viewH;

		// Rebuild the button layout when the set of trainable units changes
		// (e.g. a producing building was built or lost).
		if (this.visibleUnitIds().join(',') !== this.visibleUnitsKey) this.layout();

		ctx.fillStyle = '#0c120c';
		ctx.fillRect(sx, 0, w, h);
		ctx.strokeStyle = '#2f4a36';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(sx + 1, 0);
		ctx.lineTo(sx + 1, h);
		ctx.stroke();

		this.drawStats(ctx, sx, w);
		this.drawMinimap(ctx);
		this.drawButtons(ctx);
		this.drawSellButton(ctx, sx, w, h);
	}

	private drawStats(ctx: CanvasRenderingContext2D, sx: number, w: number): void {
		const g = this.game;
		ctx.fillStyle = '#16221a';
		ctx.fillRect(sx + 4, 4, w - 8, this.statsH - 8);
		// credits
		ctx.fillStyle = '#ffd23d';
		ctx.font = 'bold 18px Consolas, monospace';
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left';
		ctx.fillText('$ ' + g.creditsFor('player'), sx + 12, 18);
		// power
		const p = g.powerStatus('player');
		const low = p.consumed > p.produced;
		ctx.fillStyle = low ? '#ff5a4d' : '#6cff7a';
		ctx.font = '12px Consolas, monospace';
		ctx.fillText(`⚡ ${p.produced - p.consumed >= 0 ? '+' : ''}${p.produced - p.consumed}`, sx + 12, 36);
		// power bar
		const barX = sx + 70;
		const barW = w - 84;
		const frac = p.produced === 0 ? 1 : Math.min(1, p.consumed / p.produced);
		drawBar(ctx, barX, 31, barW, 8, frac, low ? '#ff5a4d' : '#3aa84a', {
			bg: '#0a0f0a',
			pad: 0,
		});
	}

	private drawMinimap(ctx: CanvasRenderingContext2D): void {
		const g = this.game;
		const mm = this.minimap;
		const tiles = g.mapTiles;
		const scale = mm.size / (tiles.w * TILE);

		ctx.fillStyle = '#05080a';
		ctx.fillRect(mm.x, mm.y, mm.size, mm.size);

		// downsample terrain: sample every other tile for perf
		const step = 1;
		const cell = TILE * scale * step;
		for (let ty = 0; ty < tiles.h; ty += step) {
			for (let tx = 0; tx < tiles.w; tx += step) {
				const s = g.fog.state(tx, ty);
				if (s === FOG_HIDDEN) continue;
				const kind = g.map.terrain[ty]![tx]!;
				let col: string;
				if (g.map.harvest[ty]![tx]! > 5) col = '#caa028';
				else col = kind === 'water' ? '#1e406a' : kind === 'rock' ? '#56565c' : kind === 'dirt' ? '#68543a' : '#3a5c2e';
				ctx.fillStyle = col;
				ctx.fillRect(mm.x + tx * TILE * scale, mm.y + ty * TILE * scale, cell + 0.5, cell + 0.5);
				if (s === 1) {
					ctx.fillStyle = 'rgba(5,8,10,0.45)';
					ctx.fillRect(mm.x + tx * TILE * scale, mm.y + ty * TILE * scale, cell + 0.5, cell + 0.5);
				}
			}
		}

		// entities
		for (const b of g.buildings) {
			if (g.fog.hidesBuilding(b.faction, b.tile)) continue;
			ctx.fillStyle = b.faction === 'player' ? '#7fd0ff' : '#ff8a7a';
			ctx.fillRect(mm.x + b.pos.x * scale - 1, mm.y + b.pos.y * scale - 1, 3, 3);
		}
		for (const u of g.units) {
			if (g.fog.hidesUnit(u.faction, u.pos)) continue;
			ctx.fillStyle = u.faction === 'player' ? '#3da5ff' : '#ff5a4d';
			ctx.fillRect(mm.x + u.pos.x * scale, mm.y + u.pos.y * scale, 2, 2);
		}

		// camera viewport rect
		const cam = g.camera;
		ctx.strokeStyle = 'rgba(255,255,255,0.8)';
		ctx.lineWidth = 1;
		ctx.strokeRect(mm.x + cam.x * scale, mm.y + cam.y * scale, cam.viewW * scale, cam.viewH * scale);

		ctx.strokeStyle = '#2f4a36';
		ctx.lineWidth = 1;
		ctx.strokeRect(mm.x - 0.5, mm.y - 0.5, mm.size + 1, mm.size + 1);
	}

	private drawButtons(ctx: CanvasRenderingContext2D): void {
		// section labels
		ctx.fillStyle = '#6cff7a';
		ctx.font = 'bold 12px Consolas, monospace';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		const firstUnitIdx = this.buttons.findIndex((b: Btn): boolean => b.kind === 'unit');
		if (this.buttons.length > 0) ctx.fillText(t('hud.structures'), this.buttons[0]!.x, this.buttons[0]!.y - 8);
		if (firstUnitIdx >= 0) ctx.fillText(t('hud.units'), this.buttons[firstUnitIdx]!.x, this.buttons[firstUnitIdx]!.y - 8);

		for (const btn of this.buttons) this.drawButton(ctx, btn);
	}

	// Contextual sell button, shown only while a player building is selected.
	private drawSellButton(ctx: CanvasRenderingContext2D, sx: number, w: number, h: number): void {
		const b = this.game.selectedBuilding;
		if (!b || b.faction !== 'player' || !b.complete) {
			this.sellBtn = null;
			return;
		}
		const pad = 6;
		const bh = 34;
		const rect = { x: sx + pad, y: h - bh - pad, w: w - pad * 2, h: bh };
		this.sellBtn = rect;
		const r = 7;
		ctx.fillStyle = '#3a1b1b';
		ctx.beginPath();
		ctx.roundRect(rect.x, rect.y, rect.w, rect.h, r);
		ctx.fill();
		ctx.strokeStyle = '#ff7a5a';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.roundRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, r);
		ctx.stroke();
		ctx.fillStyle = '#ffd0c0';
		ctx.font = 'bold 13px Consolas, monospace';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText(t('hud.sell'), rect.x + 12, rect.y + rect.h / 2);
		ctx.fillStyle = '#ffd23d';
		ctx.textAlign = 'right';
		ctx.fillText('+$' + b.sellValue, rect.x + rect.w - 12, rect.y + rect.h / 2);
	}

	private drawButton(ctx: CanvasRenderingContext2D, btn: Btn): void {
		const g = this.game;
		let name: string;
		let cost: number;
		let available: boolean;
		let progress = -1;
		let queueCount = 0;
		let ready = false;

		if (btn.kind === 'structure') {
			const id = btn.id as BuildingTypeId;
			const def = BUILDINGS[id];
			name = t(`building.${id}`);
			cost = def.cost;
			available = g.canBuildStructure(id).ok || g.structureSlot?.type === id;
			if (g.structureSlot?.type === id) {
				ready = g.structureSlot.ready;
				progress = ready ? 1 : 1 - g.structureSlot.timeLeft / g.structureSlot.total;
			}
		} else {
			const id = btn.id as UnitTypeId;
			const def = UNITS[id];
			name = t(`unit.${id}`);
			cost = def.cost;
			available = g.canTrainUnit(id).ok;
			const q = g.unitQueues[def.from] ?? [];
			queueCount = q.filter((s: UnitSlot): boolean => s.type === id).length;
			const head = q[0];
			if (head && head.type === id) progress = 1 - head.timeLeft / head.total;
		}

		// background
		const r = 7;
		ctx.fillStyle = available || progress >= 0 ? '#1b2a1f' : '#141a14';
		ctx.beginPath();
		ctx.roundRect(btn.x, btn.y, btn.w, btn.h, r);
		ctx.fill();
		ctx.strokeStyle = ready ? '#6cff7a' : '#2f4a36';
		ctx.lineWidth = ready ? 2 : 1;
		ctx.beginPath();
		ctx.roundRect(btn.x + 0.5, btn.y + 0.5, btn.w - 1, btn.h - 1, r);
		ctx.stroke();

		// icon
		ctx.save();
		ctx.globalAlpha = available || progress >= 0 ? 1 : 0.4;
		this.drawIcon(ctx, btn.kind, btn.id, btn.x + btn.w / 2, btn.y + 22, 26);
		ctx.restore();

		// name
		ctx.fillStyle = available || progress >= 0 ? '#cfe9d2' : '#5a6b5c';
		ctx.font = '11px Consolas, monospace';
		ctx.textAlign = 'center';
		ctx.fillText(this.fit(ctx, name, btn.w - 4), btn.x + btn.w / 2, btn.y + btn.h - 20);
		// cost
		ctx.fillStyle = g.creditsFor('player') >= cost ? '#ffd23d' : '#aa6a3a';
		ctx.fillText('$' + cost, btn.x + btn.w / 2, btn.y + btn.h - 9);

		// progress overlay
		if (progress >= 0 && progress < 1) {
			ctx.save();
			ctx.beginPath();
			ctx.roundRect(btn.x, btn.y, btn.w, btn.h, r);
			ctx.clip();
			ctx.fillStyle = 'rgba(0,0,0,0.6)';
			ctx.fillRect(btn.x, btn.y, btn.w, btn.h * (1 - progress));
			ctx.fillStyle = '#6cff7a';
			ctx.fillRect(btn.x, btn.y + btn.h - 2, btn.w * progress, 2);
			ctx.restore();
		}
		if (ready) {
			ctx.fillStyle = '#6cff7a';
			ctx.font = 'bold 10px Consolas, monospace';
			ctx.fillText(t('hud.place'), btn.x + btn.w / 2, btn.y + btn.h / 2 + 3);
		}
		if (queueCount > 0) {
			ctx.fillStyle = '#000';
			ctx.fillRect(btn.x + btn.w - 14, btn.y + 1, 13, 12);
			ctx.fillStyle = '#fff';
			ctx.font = 'bold 10px Consolas, monospace';
			ctx.fillText('' + queueCount, btn.x + btn.w - 7, btn.y + 10);
		}
	}

	private fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
		if (ctx.measureText(text).width <= max) return text;
		let t = text;
		while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
		return t + '…';
	}

	private drawIcon(ctx: CanvasRenderingContext2D, kind: 'structure' | 'unit', id: string, cx: number, cy: number, s: number): void {
		const blue = '#3da5ff';
		const dk = '#1c4f80';
		ctx.save();
		ctx.translate(cx, cy);
		if (kind === 'unit') {
			if (id === 'harvester') {
				ctx.fillStyle = dk;
				ctx.fillRect(-s / 2, -s / 3, s, (s * 2) / 3);
				ctx.fillStyle = blue;
				ctx.fillRect(-s / 3, -s / 4, (s * 2) / 3, s / 2);
				ctx.fillStyle = '#e0b020';
				ctx.fillRect(-s / 4, -s / 6, s / 2, s / 3);
			} else if (id === 'rifleman' || id === 'rocketeer') {
				ctx.fillStyle = blue;
				ctx.beginPath();
				ctx.ellipse(0, 2, s / 4, s / 2.5, 0, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = '#d8c69a';
				ctx.beginPath();
				ctx.arc(0, -s / 3, s / 6, 0, Math.PI * 2);
				ctx.fill();
				ctx.strokeStyle = '#111';
				ctx.lineWidth = id === 'rocketeer' ? 3 : 2;
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.lineTo(s / 2, -s / 4);
				ctx.stroke();
			} else {
				// tanks
				ctx.fillStyle = '#222';
				ctx.fillRect(-s / 2, -s / 2.5, s, s / 5);
				ctx.fillRect(-s / 2, s / 4, s, s / 5);
				ctx.fillStyle = blue;
				ctx.fillRect(-s / 2.5, -s / 4, s / 1.25, s / 2);
				ctx.fillStyle = dk;
				ctx.beginPath();
				ctx.arc(0, 0, s / 4, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillRect(0, -2, s / 1.6, 4);
			}
		} else {
			// structures
			ctx.fillStyle = blue;
			ctx.fillRect(-s / 2, -s / 2, s, s);
			ctx.fillStyle = dk;
			if (id === 'power') {
				ctx.fillStyle = '#2a2a30';
				ctx.beginPath();
				ctx.moveTo(-s / 4, s / 2);
				ctx.lineTo(-s / 6, -s / 2);
				ctx.lineTo(s / 6, -s / 2);
				ctx.lineTo(s / 4, s / 2);
				ctx.closePath();
				ctx.fill();
				ctx.fillStyle = '#4af0c0';
				ctx.fillRect(-s / 6, -s / 2, s / 3, 3);
			} else if (id === 'refinery') {
				ctx.fillStyle = '#b8b860';
				ctx.beginPath();
				ctx.arc(s / 5, 0, s / 4, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = dk;
				ctx.fillRect(-s / 2, s / 6, s, s / 4);
			} else if (id === 'barracks') {
				ctx.fillStyle = '#5a6048';
				for (let i = -s / 2 + 2; i < s / 2 - 2; i += 4) ctx.fillRect(-s / 2 + 2, i, s - 4, 2);
				ctx.fillStyle = '#111';
				ctx.fillRect(-s / 6, s / 6, s / 3, s / 3);
			} else if (id === 'factory') {
				ctx.fillStyle = '#3a3a42';
				for (let i = -s / 2; i < s / 2; i += 5) {
					ctx.beginPath();
					ctx.moveTo(i, -s / 3);
					ctx.lineTo(i + 4, -s / 3);
					ctx.lineTo(i + 4, -s / 6);
					ctx.closePath();
					ctx.fill();
				}
				ctx.fillStyle = '#caa030';
				ctx.fillRect(-s / 4, s / 6, s / 2, s / 4);
			} else if (id === 'turret') {
				ctx.fillStyle = dk;
				ctx.beginPath();
				ctx.arc(0, 0, s / 2.5, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = '#222';
				ctx.fillRect(0, -2, s / 2, 4);
			} else {
				// yard
				ctx.fillStyle = dk;
				ctx.fillRect(-s / 3, -s / 3, (s * 2) / 3, (s * 2) / 3);
				ctx.strokeStyle = '#caa030';
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(-s / 2, s / 2);
				ctx.lineTo(s / 2, -s / 2);
				ctx.stroke();
			}
		}
		ctx.restore();
	}

	// input
	handleClick(x: number, y: number, button: number): void {
		const g = this.game;
		const mm = this.minimap;
		// minimap
		if (x >= mm.x && x <= mm.x + mm.size && y >= mm.y && y <= mm.y + mm.size) {
			const scale = mm.size / (g.mapTiles.w * TILE);
			const wx = (x - mm.x) / scale;
			const wy = (y - mm.y) / scale;
			if (button === 2 && g.selectedUnits.length > 0) g.commandAt({ x: wx, y: wy });
			else g.camera.centerOn({ x: wx, y: wy });
			return;
		}

		// sell button
		const sb = this.sellBtn;
		if (sb && x >= sb.x && x <= sb.x + sb.w && y >= sb.y && y <= sb.y + sb.h) {
			if (button === 0) g.sellSelectedBuilding();
			return;
		}

		for (const btn of this.buttons) {
			if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
				if (btn.kind === 'structure') {
					if (button === 2) {
						if (g.structureSlot?.type === btn.id) g.cancelStructure();
					} else {
						g.startStructure(btn.id as BuildingTypeId);
					}
				} else {
					if (button === 2) this.cancelUnit(btn.id as UnitTypeId);
					else g.startUnit(btn.id as UnitTypeId);
				}
				return;
			}
		}
	}

	private cancelUnit(id: UnitTypeId): void {
		const g = this.game;
		const def = UNITS[id];
		const q = g.unitQueues[def.from];
		if (!q) return;
		for (let i = q.length - 1; i >= 0; i--) {
			if (q[i]!.type === id) {
				q.splice(i, 1);
				g.addCredits('player', def.cost);
				return;
			}
		}
	}
}
