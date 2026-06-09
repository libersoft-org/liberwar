import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { BUILD_ORDER, BUILDINGS, TRAIN_ORDER, UNITS } from '../core/config.ts';
import { FOG_HIDDEN } from '../map/FogOfWar.ts';
import { TILE } from '../core/types.ts';
import type { BuildingTypeId, UnitTypeId } from '../core/types.ts';
import type { Game } from '../core/Game.ts';
import type { UnitSlot } from '../systems/ProductionSystem.ts';
import { t } from '../lang/lang.ts';
import type { PixiStage } from './pixi/PixiStage.ts';
import { TextPool } from './pixi/TextPool.ts';
import { unitSpriteTexture, buildingSpriteTexture } from './pixi/entitySprites.ts';

// Recyclable pool of Sprites for HUD icons that use real textures, mirroring
// TextPool's immediate-mode pattern (begin/draw/end) since the HUD clears its
// Graphics every frame.
class IconPool {
	private readonly nodes: Sprite[] = [];
	private index = 0;

	constructor(private readonly layer: Container) {}

	begin(): void {
		this.index = 0;
	}

	draw(tex: Texture, cx: number, cy: number, size: number, alpha: number): void {
		const node = this.nodes[this.index] ?? this.create();
		this.index++;
		node.texture = tex;
		node.anchor.set(0.5);
		node.width = size;
		node.height = size;
		node.x = cx;
		node.y = cy;
		node.alpha = alpha;
		node.visible = true;
	}

	end(): void {
		for (let i = this.index; i < this.nodes.length; i++) this.nodes[i]!.visible = false;
	}

	private create(): Sprite {
		const node = new Sprite();
		this.layer.addChild(node);
		this.nodes.push(node);
		return node;
	}
}

interface Btn {
	kind: 'structure' | 'unit';
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
}
interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

// Approximate width of a Consolas glyph at a given font size (monospace).
function glyphW(size: number): number {
	return size * 0.55;
}

export class HUD {
	private game: Game;
	private buttons: Btn[] = [];
	private minimap = { x: 6, y: 56, size: 200 };
	private statsH = 50;
	private visibleUnitsKey = '';
	private sellBtn: Rect | null = null;
	private homeBtn: Rect | null = null;
	private readonly gfx = new Graphics();
	private readonly icons: IconPool;
	private readonly text: TextPool;

	constructor(game: Game, stage: PixiStage) {
		this.game = game;
		stage.hud.addChild(this.gfx);
		this.icons = new IconPool(stage.hud);
		this.text = new TextPool(stage.hud);
		this.layout();
	}

	layout(): void {
		const g = this.game;
		const sx = g.viewW; // sidebar left edge
		const pad = 6;
		const w = g.sidebarW - pad * 2;
		this.minimap = { x: sx + pad, y: this.statsH + pad, size: w };
		// Home + Sell action row sits just below the minimap, side by side.
		const actionH = 34;
		const actionGap = 4;
		const actionY = this.minimap.y + this.minimap.size + pad;
		const halfW = (w - actionGap) / 2;
		this.homeBtn = { x: sx + pad, y: actionY, w: halfW, h: actionH };
		this.sellBtn = { x: sx + pad + halfW + actionGap, y: actionY, w: halfW, h: actionH };
		this.buttons = [];
		const cols = 3;
		const gap = 4;
		const bw = (w - gap * (cols - 1)) / cols;
		const bh = 74;
		let y = actionY + actionH + 24; // leave room for the action row + "STRUCTURES" label
		const place = (kind: 'structure' | 'unit', ids: string[], startY: number): number => {
			let yy = startY;
			ids.forEach((id: string, i: number): void => {
				const col = i % cols;
				if (col === 0 && i > 0) yy += bh + gap;
				this.buttons.push({ kind, id, x: sx + pad + col * (bw + gap), y: yy, w: bw, h: bh });
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
		const sx = g.viewW;
		const w = g.sidebarW;
		const h = g.viewH;
		if (this.visibleUnitIds().join(',') !== this.visibleUnitsKey) this.layout();

		const gfx = this.gfx.clear();
		this.icons.begin();
		this.text.begin();

		gfx.rect(sx, 0, w, h).fill('#0c120c');
		gfx
			.moveTo(sx + 1, 0)
			.lineTo(sx + 1, h)
			.stroke({ width: 2, color: '#2f4a36' });

		this.drawStats(gfx, sx, w);
		this.drawMinimap(gfx);
		this.drawButtons(gfx);
		this.drawHomeButton(gfx);
		this.drawSellButton(gfx);

		this.icons.end();
		this.text.end();
	}

	private drawStats(gfx: Graphics, sx: number, w: number): void {
		const g = this.game;
		gfx.rect(sx + 4, 4, w - 8, this.statsH - 8).fill('#16221a');
		this.text.draw('$ ' + g.creditsFor('player'), sx + 12, 18, { size: 18, weight: 'bold', color: '#ffd23d', baseline: 'middle' });
		const p = g.powerStatus('player');
		const low = p.consumed > p.produced;
		const delta = p.produced - p.consumed;
		this.text.draw(`\u26a1 ${delta >= 0 ? '+' : ''}${delta}`, sx + 12, 36, { size: 12, color: low ? '#ff5a4d' : '#6cff7a', baseline: 'middle' });
		const barX = sx + 70;
		const barW = w - 84;
		const frac = p.produced === 0 ? 1 : Math.min(1, p.consumed / p.produced);
		this.bar(gfx, barX, 31, barW, 8, frac, low ? '#ff5a4d' : '#3aa84a', '#0a0f0a');
	}

	private bar(gfx: Graphics, x: number, y: number, w: number, h: number, frac: number, fill: string, bg: string): void {
		gfx.rect(x, y, w, h).fill(bg);
		gfx.rect(x, y, w * Math.max(0, Math.min(1, frac)), h).fill(fill);
	}

	private drawMinimap(gfx: Graphics): void {
		const g = this.game;
		const mm = this.minimap;
		const tiles = g.mapTiles;
		const scale = mm.size / (tiles.w * TILE);
		const cell = TILE * scale;
		gfx.rect(mm.x, mm.y, mm.size, mm.size).fill('#05080a');
		for (let ty = 0; ty < tiles.h; ty++) {
			for (let tx = 0; tx < tiles.w; tx++) {
				const s = g.fog.state(tx, ty);
				if (s === FOG_HIDDEN) continue;
				const kind = g.map.terrain[ty]![tx]!;
				let col: string;
				if (g.map.harvest[ty]![tx]! > 5) col = '#caa028';
				else col = kind === 'water' ? '#1e406a' : kind === 'rock' ? '#56565c' : kind === 'dirt' ? '#68543a' : '#3a5c2e';
				const px = mm.x + tx * TILE * scale;
				const py = mm.y + ty * TILE * scale;
				gfx.rect(px, py, cell + 0.5, cell + 0.5).fill(col);
				if (s === 1) gfx.rect(px, py, cell + 0.5, cell + 0.5).fill({ color: '#05080a', alpha: 0.45 });
			}
		}
		for (const b of g.buildings) {
			if (g.fog.hidesBuilding(b.faction, b.tile)) continue;
			gfx.rect(mm.x + b.pos.x * scale - 1, mm.y + b.pos.y * scale - 1, 3, 3).fill(b.faction === 'player' ? '#7fd0ff' : '#ff8a7a');
		}
		for (const u of g.units) {
			if (g.fog.hidesUnit(u.faction, u.pos)) continue;
			gfx.rect(mm.x + u.pos.x * scale, mm.y + u.pos.y * scale, 2, 2).fill(u.faction === 'player' ? '#3da5ff' : '#ff5a4d');
		}
		const cam = g.camera;
		gfx.rect(mm.x + cam.x * scale, mm.y + cam.y * scale, cam.viewW * scale, cam.viewH * scale).stroke({ width: 1, color: 'rgba(255,255,255,0.8)' });
		gfx.rect(mm.x - 0.5, mm.y - 0.5, mm.size + 1, mm.size + 1).stroke({ width: 1, color: '#2f4a36' });
	}

	private drawButtons(gfx: Graphics): void {
		const firstUnitIdx = this.buttons.findIndex((b: Btn): boolean => b.kind === 'unit');
		if (this.buttons.length > 0) this.text.draw(t('hud.structures'), this.buttons[0]!.x, this.buttons[0]!.y - 8, { size: 12, weight: 'bold', color: '#6cff7a' });
		if (firstUnitIdx >= 0) this.text.draw(t('hud.units'), this.buttons[firstUnitIdx]!.x, this.buttons[firstUnitIdx]!.y - 8, { size: 12, weight: 'bold', color: '#6cff7a' });
		for (const btn of this.buttons) this.drawButton(gfx, btn);
	}

	private drawSellButton(gfx: Graphics): void {
		const rect = this.sellBtn;
		if (!rect) return;
		const b = this.game.selectedBuilding;
		if (!b || b.faction !== 'player') {
			this.drawActionButton(gfx, rect, { fill: '#241616', stroke: '#5a3a36', labelColor: '#7a5a55', label: t('hud.sell'), valueColor: '#7a5a55', value: '' });
			return;
		}
		this.drawActionButton(gfx, rect, { fill: '#3a1b1b', stroke: '#ff7a5a', labelColor: '#ffd0c0', label: t('hud.sell'), valueColor: '#ffd23d', value: '+$' + b.sellValue });
	}

	private drawHomeButton(gfx: Graphics): void {
		const rect = this.homeBtn;
		if (!rect || !this.game.hasBuilding('player', 'yard')) return;
		this.drawActionButton(gfx, rect, { fill: '#16291a', stroke: '#6cff7a', labelColor: '#cdeecd', label: t('hud.home'), valueColor: '#9fe6a8', value: '[H]' });
	}

	private drawActionButton(gfx: Graphics, rect: Rect, style: { fill: string; stroke: string; labelColor: string; label: string; valueColor: string; value: string }): void {
		gfx.roundRect(rect.x, rect.y, rect.w, rect.h, 7).fill(style.fill).stroke({ width: 1.5, color: style.stroke });
		this.text.draw(style.label, rect.x + 10, rect.y + rect.h / 2, { size: 13, weight: 'bold', color: style.labelColor, baseline: 'middle' });
		this.text.draw(style.value, rect.x + rect.w - 10, rect.y + rect.h / 2, { size: 13, weight: 'bold', color: style.valueColor, baseline: 'middle', align: 'right' });
	}

	private drawButton(gfx: Graphics, btn: Btn): void {
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

		const on = available || progress >= 0;
		gfx
			.roundRect(btn.x, btn.y, btn.w, btn.h, 7)
			.fill(on ? '#1b2a1f' : '#141a14')
			.stroke({ width: ready ? 2 : 1, color: ready ? '#6cff7a' : '#2f4a36' });

		this.drawIcon(gfx, btn.kind, btn.id, btn.x + btn.w / 2, btn.y + 22, 26, on ? 1 : 0.4);

		this.text.draw(this.fit(name, btn.w - 4, 11), btn.x + btn.w / 2, btn.y + btn.h - 20, { size: 11, color: on ? '#cfe9d2' : '#5a6b5c', align: 'center' });
		this.text.draw('$' + cost, btn.x + btn.w / 2, btn.y + btn.h - 9, { size: 11, color: g.creditsFor('player') >= cost ? '#ffd23d' : '#aa6a3a', align: 'center' });

		if (progress >= 0 && progress < 1) {
			gfx.rect(btn.x, btn.y, btn.w, btn.h * (1 - progress)).fill({ color: '#000000', alpha: 0.6 });
			gfx.rect(btn.x, btn.y + btn.h - 2, btn.w * progress, 2).fill('#6cff7a');
		}
		if (ready) this.text.draw(t('hud.place'), btn.x + btn.w / 2, btn.y + btn.h / 2 + 3, { size: 10, weight: 'bold', color: '#6cff7a', align: 'center' });
		if (queueCount > 0) {
			gfx.rect(btn.x + btn.w - 14, btn.y + 1, 13, 12).fill('#000000');
			this.text.draw('' + queueCount, btn.x + btn.w - 7, btn.y + 10, { size: 10, weight: 'bold', color: '#ffffff', align: 'center' });
		}
	}

	private fit(text: string, max: number, size: number): string {
		const cw = glyphW(size);
		const maxChars = Math.floor(max / cw);
		if (text.length <= maxChars) return text;
		return text.slice(0, Math.max(1, maxChars - 1)) + '\u2026';
	}

	private drawIcon(gfx: Graphics, kind: 'structure' | 'unit', id: string, cx: number, cy: number, s: number, alpha: number): void {
		const blue = '#3da5ff';
		const dk = '#1c4f80';
		const f = (col: string): { color: string; alpha: number } => ({ color: col, alpha });
		if (kind === 'unit') {
			this.icons.draw(unitSpriteTexture(id as UnitTypeId, 'player') ?? Texture.EMPTY, cx, cy, s * 1.5, alpha);
		} else {
			const tex = buildingSpriteTexture(id as BuildingTypeId, 'player');
			if (tex) {
				this.icons.draw(tex, cx, cy, s * 1.5, alpha);
				return;
			}
			gfx.rect(cx - s / 2, cy - s / 2, s, s).fill(f(blue));
			if (id === 'refinery') {
				gfx.circle(cx + s / 5, cy, s / 4).fill(f('#b8b860'));
				gfx.rect(cx - s / 2, cy + s / 6, s, s / 4).fill(f(dk));
			} else if (id === 'barracks') {
				for (let i = -s / 2 + 2; i < s / 2 - 2; i += 4) gfx.rect(cx - s / 2 + 2, cy + i, s - 4, 2).fill(f('#5a6048'));
				gfx.rect(cx - s / 6, cy + s / 6, s / 3, s / 3).fill(f('#111111'));
			} else if (id === 'factory') {
				for (let i = -s / 2; i < s / 2; i += 5) gfx.poly([cx + i, cy - s / 3, cx + i + 4, cy - s / 3, cx + i + 4, cy - s / 6]).fill(f('#3a3a42'));
				gfx.rect(cx - s / 4, cy + s / 6, s / 2, s / 4).fill(f('#caa030'));
			} else if (id === 'turret') {
				gfx.circle(cx, cy, s / 2.5).fill(f(dk));
				gfx.rect(cx, cy - 2, s / 2, 4).fill(f('#222222'));
			}
		}
	}

	// input
	handleClick(x: number, y: number, button: number): void {
		const g = this.game;
		const mm = this.minimap;
		if (x >= mm.x && x <= mm.x + mm.size && y >= mm.y && y <= mm.y + mm.size) {
			const scale = mm.size / (g.mapTiles.w * TILE);
			const wx = (x - mm.x) / scale;
			const wy = (y - mm.y) / scale;
			if (button === 2 && g.selectedUnits.length > 0) g.commandAt({ x: wx, y: wy });
			else g.camera.centerOn({ x: wx, y: wy });
			return;
		}

		const sb = this.sellBtn;
		const sbBuilding = g.selectedBuilding;
		if (sb && sbBuilding && sbBuilding.faction === 'player' && x >= sb.x && x <= sb.x + sb.w && y >= sb.y && y <= sb.y + sb.h) {
			if (button === 0) g.sellSelectedBuilding();
			return;
		}

		const hb = this.homeBtn;
		if (hb && g.hasBuilding('player', 'yard') && x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) {
			if (button === 0) g.homeView();
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
