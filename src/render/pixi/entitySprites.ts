import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { FACTION_COLORS } from '../../core/config.ts';
import { TILE } from '../../core/types.ts';
import type { Faction, FactionPalette, TerrainKind, UnitTypeId } from '../../core/types.ts';
import type { Unit } from '../../entities/Unit.ts';
import type { Building } from '../../entities/Building.ts';
import { texture } from './textures.ts';

// Retained PixiJS display objects mirroring the procedural shapes that the old
// Canvas 2D `sprites.ts` drew. Geometry is built once per entity; per-frame
// updates only move/rotate the nodes (see WorldView).

function clampByte(v: number): number {
	return Math.max(0, Math.min(255, Math.round(v)));
}

const TERRAIN_BASE: Record<TerrainKind, [number, number, number]> = {
	grass: [58, 92, 46],
	dirt: [104, 84, 54],
	rock: [86, 86, 92],
	water: [30, 64, 104],
};

// Draws one terrain tile into a shared Graphics at absolute world coordinates.
export function drawTerrainTile(g: Graphics, kind: TerrainKind, px: number, py: number, variation: number): void {
	const [r, gr, b] = TERRAIN_BASE[kind];
	const v = (variation - 0.5) * 28;
	const base = `rgb(${clampByte(r + v)},${clampByte(gr + v)},${clampByte(b + v)})`;
	g.rect(px, py, TILE, TILE).fill(base);

	if (kind === 'grass' && variation > 0.6) {
		g.rect(px + 6, py + 8, 3, 5)
			.rect(px + 18, py + 16, 3, 5)
			.rect(px + 24, py + 4, 3, 5)
			.fill({ color: 'rgb(40,70,30)', alpha: 0.5 });
	} else if (kind === 'rock') {
		g.rect(px + 4, py + 4, 10, 8).fill({ color: 'rgb(60,60,66)', alpha: 0.6 });
		g.rect(px + 18, py + 16, 9, 9).fill({ color: 'rgb(120,120,128)', alpha: 0.5 });
	} else if (kind === 'water') {
		g.rect(px, py + ((variation * 20) % TILE), TILE, 2).fill({ color: 'rgb(120,170,220)', alpha: 0.1 + variation * 0.12 });
	}
}

// Units

export interface UnitView {
	container: Container;
	// Parts that rotate independently each frame; null when not applicable.
	body: Container | null; // rotates with unit.facing
	turret: Container | null; // rotates with unit.turret (tank turret / infantry weapon)
}

// Sprite-based units: per-faction art and the display size as a multiple of
// the unit's radius. Adding a new sprite unit is a single entry here.
interface SpriteUnitDef {
	art: Record<Faction, string>;
	scale: number;
}

const SPRITE_UNITS: Partial<Record<UnitTypeId, SpriteUnitDef>> = {
	harvester: {
		art: {
			player: 'sprites/units/harvester-blue.webp',
			enemy: 'sprites/units/harvester-red.webp',
		},
		scale: 5,
	},
	lighttank: {
		art: {
			player: 'sprites/units/tank-light-blue.webp',
			enemy: 'sprites/units/tank-light-red.webp',
		},
		scale: 3.5,
	},
	heavytank: {
		art: {
			player: 'sprites/units/tank-heavy-blue.webp',
			enemy: 'sprites/units/tank-heavy-red.webp',
		},
		scale: 4,
	},
};

function textureKey(typeId: UnitTypeId, faction: Faction): string {
	return `${typeId}-${faction}`;
}

// Key -> url map of every sprite-unit texture, for bootstrap preloading.
export function unitSpriteUrls(): Record<string, string> {
	const urls: Record<string, string> = {};
	for (const [typeId, def] of Object.entries(SPRITE_UNITS) as [UnitTypeId, SpriteUnitDef][]) {
		urls[textureKey(typeId, 'player')] = def.art.player;
		urls[textureKey(typeId, 'enemy')] = def.art.enemy;
	}
	return urls;
}

// Texture for a sprite unit, or null if the unit is drawn procedurally.
export function unitSpriteTexture(typeId: UnitTypeId, faction: Faction): Texture | null {
	return SPRITE_UNITS[typeId] ? texture(textureKey(typeId, faction)) : null;
}

export function buildUnitView(u: Unit): UnitView {
	const c = FACTION_COLORS[u.faction];
	const container = new Container();

	// shadow (static)
	const shadow = new Graphics();
	shadow.ellipse(0, u.radius * 0.5, u.radius * 1.05, u.radius * 0.5).fill({ color: '#000000', alpha: 0.28 });
	container.addChild(shadow);

	if (u.typeId === 'infantry' || u.typeId === 'rocketeer') return buildInfantry(container, u, c);
	const def = SPRITE_UNITS[u.typeId];
	if (def) return { container, body: addSpriteBody(container, texture(textureKey(u.typeId, u.faction)), u.radius * def.scale), turret: null };
	return buildInfantry(container, u, c);
}

// Builds a rotating body holding a single square sprite. The art faces left
// (-x); rotating by PI aligns it with the unit's facing (0 = +x) before the
// body rotates per frame.
function addSpriteBody(container: Container, texture: Texture, size: number): Container {
	const body = new Container();
	const sprite = new Sprite(texture);
	sprite.anchor.set(0.5);
	sprite.width = size;
	sprite.height = size;
	sprite.rotation = Math.PI;
	body.addChild(sprite);
	container.addChild(body);
	return body;
}

function buildInfantry(container: Container, u: Unit, c: FactionPalette): UnitView {
	const rocket = u.typeId === 'rocketeer';
	const body = new Graphics();
	body.ellipse(0, 0, 4, 5.5).fill(c.dark);
	body.ellipse(0, -1, 3, 4).fill(c.primary);
	body.circle(0, -4.5, 2.4).fill(rocket ? '#caa14d' : '#d8c69a');
	container.addChild(body);

	// weapon rotates with turret angle: a line of length 8 from the origin
	const turret = new Graphics();
	turret
		.moveTo(0, 0)
		.lineTo(8, 0)
		.stroke({ width: rocket ? 2 : 1.4, color: '#1c1c1c' });
	container.addChild(turret);

	// Infantry body itself does not rotate with facing.
	return { container, body: null, turret };
}

// Buildings

export interface BuildingView {
	container: Container;
	body: Container; // full building art (masked while under construction)
	mask: Graphics; // reveal mask for build progress
	scaffold: Graphics; // shown only while incomplete
	shade: Graphics; // dark backing shown while incomplete
	turret: Graphics | null; // rotates with turretAngle (turret buildings)
}

export function buildBuildingView(b: Building): BuildingView {
	const c = FACTION_COLORS[b.faction];
	const w = b.def.w * TILE;
	const h = b.def.h * TILE;
	const container = new Container();
	container.x = b.tile.x * TILE;
	container.y = b.tile.y * TILE;

	const shade = new Graphics();
	shade.rect(0, 0, w, h).fill({ color: '#141414', alpha: 0.5 });
	container.addChild(shade);

	const body = new Container();
	const turret = drawBuildingBody(body, b, c, w, h);
	container.addChild(body);

	const mask = new Graphics();
	mask.rect(0, 0, w, h).fill('#ffffff');
	container.addChild(mask);

	const scaffold = new Graphics();
	for (let i = 0; i < w; i += 8) scaffold.moveTo(i, 0).lineTo(i, h);
	scaffold.stroke({ width: 1, color: 'rgb(255,210,80)', alpha: 0.5 });
	container.addChild(scaffold);

	return { container, body, mask, scaffold, shade, turret };
}

function drawBuildingBody(body: Container, b: Building, c: FactionPalette, w: number, h: number): Graphics | null {
	const base = new Graphics();
	base.rect(4, 4, w, h).fill({ color: '#000000', alpha: 0.3 }); // shadow
	base
		.roundRect(1, 1, w - 2, h - 2, 4)
		.fill(c.primary)
		.stroke({ width: 1.5, color: 'rgb(0,0,0)', alpha: 0.4 });
	body.addChild(base);

	switch (b.typeId) {
		case 'yard':
			detailYard(base, w, h, c);
			return null;
		case 'power':
			detailPower(base, w, h);
			return null;
		case 'refinery':
			detailRefinery(base, w, h, c);
			return null;
		case 'barracks':
			detailBarracks(base, w, h);
			return null;
		case 'factory':
			detailFactory(base, w, h, c);
			return null;
		case 'turret':
			return detailTurret(body, w, h, c);
		default:
			return null;
	}
}

function detailYard(g: Graphics, w: number, h: number, c: FactionPalette): void {
	g.rect(w * 0.2, h * 0.2, w * 0.6, h * 0.6).fill(c.dark);
	for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.rect(w * 0.26 + i * w * 0.2, h * 0.26 + j * h * 0.2, 5, 5);
	g.fill('#d8d8d8');
	g.moveTo(8, h - 8)
		.lineTo(w - 10, 8)
		.stroke({ width: 3, color: '#caa030' });
}

function detailPower(g: Graphics, w: number, h: number): void {
	for (const cx of [w * 0.32, w * 0.68]) {
		g.poly([cx - 7, h - 6, cx - 4, 8, cx + 4, 8, cx + 7, h - 6]).fill('#2a2a30');
		g.rect(cx - 4, 6, 8, 3).fill('#4af0c0');
	}
}

function detailRefinery(g: Graphics, w: number, h: number, c: FactionPalette): void {
	g.rect(6, h * 0.5, w - 12, h * 0.4).fill(c.dark);
	g.circle(w * 0.75, h * 0.35, w * 0.18).fill('#b8b860');
	g.rect(10, 10, w * 0.3, h * 0.25).fill('#8a8a40');
	g.moveTo(w * 0.2, h * 0.5)
		.lineTo(w * 0.75, h * 0.5)
		.stroke({ width: 3, color: '#555555' });
}

function detailBarracks(g: Graphics, w: number, h: number): void {
	g.rect(5, 5, w - 10, h - 10).fill('#3a3f33');
	for (let i = 8; i < h - 6; i += 7) g.rect(7, i, w - 14, 3);
	g.fill('#5a6048');
	g.rect(w * 0.4, h - 12, w * 0.2, 10).fill('#1c1c1c');
}

function detailFactory(g: Graphics, w: number, h: number, c: FactionPalette): void {
	g.rect(5, 5, w - 10, h - 10).fill(c.dark);
	for (let i = 6; i < w - 8; i += 10) g.poly([i, 8, i + 8, 8, i + 8, 16]);
	g.fill('#3a3a42');
	g.rect(w * 0.3, h - 16, w * 0.4, 14).fill('#15151a');
	g.rect(w * 0.3, h - 4, w * 0.4, 2).fill('#caa030');
}

function detailTurret(body: Container, w: number, h: number, c: FactionPalette): Graphics {
	const cx = w / 2;
	const cy = h / 2;
	const base = new Graphics();
	base.circle(cx, cy, w * 0.42).fill(c.dark);
	body.addChild(base);

	const turret = new Graphics();
	turret.rect(0, -2.5, w * 0.55, 5).fill('#26262c');
	turret.circle(0, 0, w * 0.22).fill(c.light);
	turret.x = cx;
	turret.y = cy;
	body.addChild(turret);
	return turret;
}
