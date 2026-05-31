import { FACTION_COLORS, HARVEST_PER_TILE } from '../core/config.ts';
import { TILE } from '../core/types.ts';
import { clamp } from '../math/vec.ts';
import type { FactionPalette, TerrainKind } from '../core/types.ts';
import type { Unit } from '../entities/Unit.ts';
import type { Building } from '../entities/Building.ts';

type Ctx = CanvasRenderingContext2D;

/**
 * Draws a filled progress/health bar: a background rectangle (inflated by
 * `pad` on every side) with a `fill`-coloured bar on top whose width tracks
 * `frac` (clamped to 0..1). Shared by the world health bars and the HUD gauges.
 */
export function drawBar(ctx: Ctx, x: number, y: number, w: number, h: number, frac: number, fill: string, opts: { bg?: string; pad?: number } = {}): void {
	const bg = opts.bg ?? 'rgba(0,0,0,0.7)';
	const pad = opts.pad ?? 1;
	ctx.fillStyle = bg;
	ctx.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
	ctx.fillStyle = fill;
	ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
}

// Terrain
const TERRAIN_BASE: Record<TerrainKind, [number, number, number]> = {
	grass: [58, 92, 46],
	dirt: [104, 84, 54],
	rock: [86, 86, 92],
	water: [30, 64, 104],
};

export function drawTerrainTile(ctx: Ctx, kind: TerrainKind, px: number, py: number, variation: number): void {
	const [r, g, b] = TERRAIN_BASE[kind];
	const v = (variation - 0.5) * 28;
	ctx.fillStyle = `rgb(${clampByte(r + v)},${clampByte(g + v)},${clampByte(b + v)})`;
	ctx.fillRect(px, py, TILE, TILE);

	// subtle texture detail
	if (kind === 'grass' && variation > 0.6) {
		ctx.fillStyle = `rgba(40,70,30,0.5)`;
		ctx.fillRect(px + 6, py + 8, 3, 5);
		ctx.fillRect(px + 18, py + 16, 3, 5);
		ctx.fillRect(px + 24, py + 4, 3, 5);
	} else if (kind === 'rock') {
		ctx.fillStyle = `rgba(60,60,66,0.6)`;
		ctx.fillRect(px + 4, py + 4, 10, 8);
		ctx.fillStyle = `rgba(120,120,128,0.5)`;
		ctx.fillRect(px + 18, py + 16, 9, 9);
	} else if (kind === 'water') {
		ctx.fillStyle = `rgba(120,170,220,${0.1 + variation * 0.12})`;
		ctx.fillRect(px, py + ((variation * 20) % TILE), TILE, 2);
	}
}

export function drawHarvest(ctx: Ctx, px: number, py: number, amount: number): void {
	if (amount <= 0) return;
	// Dot count scales with the tile's fill ratio toward full saturation:
	// 0 = no dots, any harvest = at least 1 dot, full tile = 10 dots.
	const frac = Math.min(1, amount / HARVEST_PER_TILE);
	const n = Math.max(1, Math.round(frac * 10));
	const intensity = frac;
	// pseudo-stable scatter based on tile position
	let seed = (px * 73856093) ^ (py * 19349663);
	const rnd = (): number => {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		return (seed % 1000) / 1000;
	};
	for (let i = 0; i < n; i++) {
		const ox = px + 4 + rnd() * (TILE - 8);
		const oy = py + 4 + rnd() * (TILE - 8);
		const s = 2 + rnd() * 3;
		const c = 200 + Math.floor(intensity * 55);
		ctx.fillStyle = `rgb(${c},${Math.floor(c * 0.85)},${40})`;
		ctx.beginPath();
		ctx.arc(ox, oy, s, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = `rgba(255,240,150,0.6)`;
		ctx.fillRect(ox - 1, oy - 1, 1.5, 1.5);
	}
}

// Units
export function drawUnit(ctx: Ctx, u: Unit): void {
	const c = FACTION_COLORS[u.faction];
	const x = u.pos.x;
	const y = u.pos.y;

	// shadow
	ctx.fillStyle = 'rgba(0,0,0,0.28)';
	ctx.beginPath();
	ctx.ellipse(x, y + u.radius * 0.5, u.radius * 1.05, u.radius * 0.5, 0, 0, Math.PI * 2);
	ctx.fill();

	if (u.isHarvester) drawHarvester(ctx, u, c);
	else if (u.typeId === 'rifleman' || u.typeId === 'rocketeer') drawInfantry(ctx, u, c);
	else drawTank(ctx, u, c);
}

function drawTank(ctx: Ctx, u: Unit, c: FactionPalette): void {
	const x = u.pos.x;
	const y = u.pos.y;
	const r = u.radius;
	const heavy = u.typeId === 'heavytank';

	ctx.save();
	ctx.translate(x, y);
	// body
	ctx.rotate(u.facing);
	// treads
	ctx.fillStyle = '#23252b';
	ctx.fillRect(-r, -r * 0.95, r * 2, r * 0.45);
	ctx.fillRect(-r, r * 0.5, r * 2, r * 0.45);
	ctx.fillStyle = '#16171b';
	for (let i = -r; i < r; i += 4) {
		ctx.fillRect(i, -r * 0.95, 2, r * 0.45);
		ctx.fillRect(i, r * 0.5, 2, r * 0.45);
	}
	// hull
	const grad = ctx.createLinearGradient(0, -r * 0.5, 0, r * 0.5);
	grad.addColorStop(0, c.light);
	grad.addColorStop(0.5, c.primary);
	grad.addColorStop(1, c.dark);
	ctx.fillStyle = grad;
	roundRect(ctx, -r * 0.85, -r * 0.55, r * 1.7, r * 1.1, 3);
	ctx.fill();
	ctx.restore();

	// turret
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(u.turret);
	ctx.fillStyle = c.dark;
	ctx.fillRect(0, -2.5, r * (heavy ? 1.5 : 1.25), heavy ? 5 : 4); // barrel
	ctx.fillStyle = c.primary;
	ctx.beginPath();
	ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = c.light;
	ctx.beginPath();
	ctx.arc(-r * 0.12, -r * 0.12, r * 0.22, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawHarvester(ctx: Ctx, u: Unit, c: FactionPalette): void {
	const x = u.pos.x;
	const y = u.pos.y;
	const r = u.radius;
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(u.facing);
	// tracks
	ctx.fillStyle = '#202126';
	ctx.fillRect(-r, -r, r * 2, r * 2);
	// body
	ctx.fillStyle = c.dark;
	roundRect(ctx, -r * 0.9, -r * 0.8, r * 1.8, r * 1.6, 4);
	ctx.fill();
	ctx.fillStyle = c.primary;
	roundRect(ctx, -r * 0.5, -r * 0.7, r * 1.2, r * 1.4, 3);
	ctx.fill();
	// scoop at front
	ctx.fillStyle = '#3a3a40';
	ctx.fillRect(r * 0.7, -r * 0.6, r * 0.5, r * 1.2);
	ctx.fillStyle = c.light;
	ctx.fillRect(-r * 0.3, -r * 0.5, r * 0.4, r * 0.3);
	ctx.restore();
}

function drawInfantry(ctx: Ctx, u: Unit, c: FactionPalette): void {
	const x = u.pos.x;
	const y = u.pos.y;
	const rocket = u.typeId === 'rocketeer';
	// body
	ctx.fillStyle = c.dark;
	ctx.beginPath();
	ctx.ellipse(x, y, 4, 5.5, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = c.primary;
	ctx.beginPath();
	ctx.ellipse(x, y - 1, 3, 4, 0, 0, Math.PI * 2);
	ctx.fill();
	// head / helmet
	ctx.fillStyle = rocket ? '#caa14d' : '#d8c69a';
	ctx.beginPath();
	ctx.arc(x, y - 4.5, 2.4, 0, Math.PI * 2);
	ctx.fill();
	// weapon
	ctx.strokeStyle = '#1c1c1c';
	ctx.lineWidth = rocket ? 2 : 1.4;
	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.lineTo(x + Math.cos(u.turret) * 8, y + Math.sin(u.turret) * 8);
	ctx.stroke();
}

// Buildings
export function drawBuilding(ctx: Ctx, b: Building): void {
	const c = FACTION_COLORS[b.faction];
	const w = b.def.w * TILE;
	const h = b.def.h * TILE;
	const px = b.tile.x * TILE;
	const py = b.tile.y * TILE;

	// under construction: draw scaffold + clip
	if (!b.complete) {
		ctx.fillStyle = 'rgba(20,20,20,0.5)';
		ctx.fillRect(px, py, w, h);
		ctx.save();
		ctx.beginPath();
		ctx.rect(px, py + h * (1 - b.buildProgress), w, h * b.buildProgress);
		ctx.clip();
		drawBuildingBody(ctx, b, c, px, py, w, h);
		ctx.restore();
		// scaffold lines
		ctx.strokeStyle = 'rgba(255,210,80,0.5)';
		ctx.lineWidth = 1;
		for (let i = 0; i < w; i += 8) {
			ctx.beginPath();
			ctx.moveTo(px + i, py);
			ctx.lineTo(px + i, py + h);
			ctx.stroke();
		}
		return;
	}
	drawBuildingBody(ctx, b, c, px, py, w, h);
}

function drawBuildingBody(ctx: Ctx, b: Building, c: FactionPalette, px: number, py: number, w: number, h: number): void {
	// shadow
	ctx.fillStyle = 'rgba(0,0,0,0.3)';
	ctx.fillRect(px + 4, py + 4, w, h);

	// base slab
	const grad = ctx.createLinearGradient(px, py, px, py + h);
	grad.addColorStop(0, c.light);
	grad.addColorStop(0.4, c.primary);
	grad.addColorStop(1, c.dark);
	ctx.fillStyle = grad;
	roundRect(ctx, px + 1, py + 1, w - 2, h - 2, 4);
	ctx.fill();
	ctx.strokeStyle = 'rgba(0,0,0,0.4)';
	ctx.lineWidth = 1.5;
	ctx.stroke();

	switch (b.typeId) {
		case 'yard':
			detailYard(ctx, px, py, w, h, c);
			break;
		case 'power':
			detailPower(ctx, px, py, w, h);
			break;
		case 'refinery':
			detailRefinery(ctx, px, py, w, h, c);
			break;
		case 'barracks':
			detailBarracks(ctx, px, py, w, h);
			break;
		case 'factory':
			detailFactory(ctx, px, py, w, h, c);
			break;
		case 'turret':
			detailTurret(ctx, b, px, py, w, h, c);
			break;
	}
}

function detailYard(ctx: Ctx, px: number, py: number, w: number, h: number, c: { dark: string }): void {
	ctx.fillStyle = c.dark;
	ctx.fillRect(px + w * 0.2, py + h * 0.2, w * 0.6, h * 0.6);
	ctx.fillStyle = '#d8d8d8';
	for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) ctx.fillRect(px + w * 0.26 + i * w * 0.2, py + h * 0.26 + j * h * 0.2, 5, 5);
	// crane
	ctx.strokeStyle = '#caa030';
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(px + 8, py + h - 8);
	ctx.lineTo(px + w - 10, py + 8);
	ctx.stroke();
}

function detailPower(ctx: Ctx, px: number, py: number, w: number, h: number): void {
	ctx.fillStyle = '#2a2a30';
	// cooling towers
	for (const cx of [px + w * 0.32, px + w * 0.68]) {
		ctx.beginPath();
		ctx.moveTo(cx - 7, py + h - 6);
		ctx.lineTo(cx - 4, py + 8);
		ctx.lineTo(cx + 4, py + 8);
		ctx.lineTo(cx + 7, py + h - 6);
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = '#4af0c0';
		ctx.fillRect(cx - 4, py + 6, 8, 3);
		ctx.fillStyle = '#2a2a30';
	}
}

function detailRefinery(ctx: Ctx, px: number, py: number, w: number, h: number, c: { dark: string }): void {
	ctx.fillStyle = c.dark;
	ctx.fillRect(px + 6, py + h * 0.5, w - 12, h * 0.4);
	// silo
	ctx.fillStyle = '#b8b860';
	ctx.beginPath();
	ctx.arc(px + w * 0.75, py + h * 0.35, w * 0.18, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#8a8a40';
	ctx.fillRect(px + 10, py + 10, w * 0.3, h * 0.25);
	// pipes
	ctx.strokeStyle = '#555';
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(px + w * 0.2, py + h * 0.5);
	ctx.lineTo(px + w * 0.75, py + h * 0.5);
	ctx.stroke();
}

function detailBarracks(ctx: Ctx, px: number, py: number, w: number, h: number): void {
	ctx.fillStyle = '#3a3f33';
	ctx.fillRect(px + 5, py + 5, w - 10, h - 10);
	// roof stripes
	ctx.fillStyle = '#5a6048';
	for (let i = py + 8; i < py + h - 6; i += 7) ctx.fillRect(px + 7, i, w - 14, 3);
	// door
	ctx.fillStyle = '#1c1c1c';
	ctx.fillRect(px + w * 0.4, py + h - 12, w * 0.2, 10);
}

function detailFactory(ctx: Ctx, px: number, py: number, w: number, h: number, c: { dark: string }): void {
	ctx.fillStyle = c.dark;
	ctx.fillRect(px + 5, py + 5, w - 10, h - 10);
	// sawtooth roof
	ctx.fillStyle = '#3a3a42';
	for (let i = px + 6; i < px + w - 8; i += 10) {
		ctx.beginPath();
		ctx.moveTo(i, py + 8);
		ctx.lineTo(i + 8, py + 8);
		ctx.lineTo(i + 8, py + 16);
		ctx.closePath();
		ctx.fill();
	}
	// big door
	ctx.fillStyle = '#15151a';
	ctx.fillRect(px + w * 0.3, py + h - 16, w * 0.4, 14);
	ctx.fillStyle = '#caa030';
	ctx.fillRect(px + w * 0.3, py + h - 4, w * 0.4, 2);
}

function detailTurret(ctx: Ctx, b: Building, px: number, py: number, w: number, h: number, c: { dark: string; light: string }): void {
	const cx = px + w / 2;
	const cy = py + h / 2;
	ctx.fillStyle = c.dark;
	ctx.beginPath();
	ctx.arc(cx, cy, w * 0.42, 0, Math.PI * 2);
	ctx.fill();
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(b.turretAngle);
	ctx.fillStyle = '#26262c';
	ctx.fillRect(0, -2.5, w * 0.55, 5);
	ctx.fillStyle = c.light;
	ctx.beginPath();
	ctx.arc(0, 0, w * 0.22, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

// helpers
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.arcTo(x + w, y, x + w, y + h, rr);
	ctx.arcTo(x + w, y + h, x, y + h, rr);
	ctx.arcTo(x, y + h, x, y, rr);
	ctx.arcTo(x, y, x + w, y, rr);
	ctx.closePath();
}

function clampByte(v: number): number {
	return Math.max(0, Math.min(255, Math.round(v)));
}
