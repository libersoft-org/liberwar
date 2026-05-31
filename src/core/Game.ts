import { AudioEngine } from '../audio/AudioEngine.ts';
import { Camera } from '../render/Camera.ts';
import { FACTION_COLORS, HARVESTER_CAPACITY } from './config.ts';
import { GameMap } from '../map/GameMap.ts';
import { FogOfWar } from '../map/FogOfWar.ts';
import { Effect, Projectile } from '../entities/Projectile.ts';
import { Building } from '../entities/Building.ts';
import { Unit } from '../entities/Unit.ts';
import { EnemyAI } from '../AI.ts';
import type { Difficulty } from '../AI.ts';
import { Renderer } from '../render/Renderer.ts';
import { HUD } from '../render/HUD.ts';
import { Toast } from '../render/Toast.ts';
import { InputController } from '../Input.ts';
import { MAP_H, MAP_W, TILE } from './types.ts';
import type { BuildingTypeId, Faction, FactionPalette, UnitTypeId, Vec2 } from './types.ts';
import type { Entity, ProjectileSpec, World } from './world.ts';
import { EconomySystem } from '../systems/EconomySystem.ts';
import { ProductionSystem } from '../systems/ProductionSystem.ts';
import type { StructureSlot, UnitSlot } from '../systems/ProductionSystem.ts';
import { PlacementSystem } from '../systems/PlacementSystem.ts';
import { CombatResolver } from '../combat/CombatResolver.ts';
import { SelectionSystem } from '../systems/SelectionSystem.ts';
import { EntityQuery } from '../systems/EntityQuery.ts';

/**
 * Thin orchestrator implementing the {@link World} contract. State and rules
 * live in dedicated systems (economy, production, placement, combat,
 * selection); Game wires them together, owns the entity lists and the main
 * loop, and exposes a stable facade so HUD/Input/Renderer/AI stay unchanged.
 */
export class Game implements World {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	map: GameMap;
	fog = new FogOfWar();
	camera = new Camera();
	audio: AudioEngine;
	renderer: Renderer;
	hud: HUD;
	toast: Toast;
	input: InputController;
	ai: EnemyAI;
	units: Unit[] = [];
	buildings: Building[] = [];
	projectiles: Projectile[] = [];
	effects: Effect[] = [];

	// systems
	query: EntityQuery;
	economy: EconomySystem;
	production: ProductionSystem;
	placement: PlacementSystem;
	combat: CombatResolver;
	selection: SelectionSystem;

	time = 0;
	running = false;
	paused = false;
	gameOver: null | 'win' | 'lose' = null;

	private rngState: number;
	private onEnd: (result: 'win' | 'lose') => void;
	private onQuit: () => void;
	private onPauseChange: (paused: boolean) => void;
	private screenShake = 0;
	readonly sidebarW = 252;

	constructor(canvas: HTMLCanvasElement, difficulty: Difficulty, onEnd: (result: 'win' | 'lose') => void, onQuit: () => void, onPauseChange: (paused: boolean) => void) {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d', { alpha: false })!;
		this.onEnd = onEnd;
		this.onQuit = onQuit;
		this.onPauseChange = onPauseChange;
		this.rngState = (Math.random() * 0xffffffff) >>> 0;
		const seed = (Math.random() * 0xffffffff) >>> 0;
		this.map = new GameMap(seed);
		this.audio = new AudioEngine();

		this.query = new EntityQuery(
			(): Unit[] => this.units,
			(): Building[] => this.buildings
		);
		this.economy = new EconomySystem(this.query);
		this.placement = new PlacementSystem(this.map, (): Building[] => this.buildings, this.fog);
		this.combat = new CombatResolver(
			(): Unit[] => this.units,
			(): Building[] => this.buildings
		);
		this.production = new ProductionSystem(this);
		this.selection = new SelectionSystem(this);

		this.renderer = new Renderer(this);
		this.hud = new HUD(this);
		this.toast = new Toast();
		this.input = new InputController(this);
		this.ai = new EnemyAI(this, difficulty);

		this.resize();
		this.setupBases();
	}

	rng(): number {
		let s = this.rngState;
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		this.rngState = s >>> 0;
		return (this.rngState % 100000) / 100000;
	}

	// viewport
	resize(): void {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const w = window.innerWidth;
		const h = window.innerHeight;
		this.canvas.width = Math.floor(w * dpr);
		this.canvas.height = Math.floor(h * dpr);
		this.canvas.style.width = w + 'px';
		this.canvas.style.height = h + 'px';
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		this.camera.setViewport(w - this.sidebarW, h);
	}

	get viewW(): number {
		return window.innerWidth - this.sidebarW;
	}
	get viewH(): number {
		return window.innerHeight;
	}

	// selection / production facade (delegates to systems)
	get selectedUnits(): Unit[] {
		return this.selection.selectedUnits;
	}
	get selectedBuilding(): Building | null {
		return this.selection.selectedBuilding;
	}
	get selectedHarvestTile(): Vec2 | null {
		return this.selection.selectedHarvestTile;
	}
	get structureSlot(): StructureSlot | null {
		return this.production.structureSlot;
	}
	get unitQueues(): Record<string, UnitSlot[]> {
		return this.production.unitQueues;
	}
	get pendingPlacement(): BuildingTypeId | null {
		return this.production.pendingPlacement;
	}
	set pendingPlacement(v: BuildingTypeId | null) {
		this.production.pendingPlacement = v;
	}

	// base setup
	private setupBases(): void {
		const playerSpot = this.placement.findBaseSpot(8, 8, 22, 22, (): number => this.rng());
		const enemySpot = this.placement.findBaseSpot(MAP_W - 22, MAP_H - 22, MAP_W - 8, MAP_H - 8, (): number => this.rng());

		this.createStartBase('player', playerSpot);
		this.createStartBase('enemy', enemySpot);

		const yard = this.query.firstBuilding('player', 'yard');
		if (yard) this.camera.centerOn(yard.pos);
	}

	private createStartBase(faction: Faction, spot: Vec2): void {
		const yard = this.placeBuilding('yard', faction, spot, true);
		this.placeBuilding('power', faction, { x: spot.x + 3, y: spot.y }, true);
		// refinery placed adjacent if room, else near
		const refSpot = this.placement.canPlaceBuilding(spot.x, spot.y + 3, 3, 3) ? { x: spot.x, y: spot.y + 3 } : this.placement.findFreeSpotNear(yard, 3, 3);
		this.placeBuilding('refinery', faction, refSpot, true);
		// starting harvester
		const h = this.spawnUnit('harvester', faction, this.findSpawnNear(yard));
		h.orderHarvest(this);
	}

	// entity factory
	spawnUnit(type: UnitTypeId, faction: Faction, pos: Vec2): Unit {
		const u = new Unit(type, faction, pos);
		this.units.push(u);
		return u;
	}

	placeBuilding(type: BuildingTypeId, faction: Faction, tile: Vec2, instant: boolean): Building {
		const b = new Building(type, faction, tile, instant);
		for (let y = tile.y; y < tile.y + b.def.h; y++) for (let x = tile.x; x < tile.x + b.def.w; x++) this.map.setBlocked(x, y, true);
		this.buildings.push(b);
		if (faction === 'enemy') this.audio.play('build');
		return b;
	}

	// placement facade
	canPlaceBuilding(tx: number, ty: number, w: number, h: number): boolean {
		return this.placement.canPlaceBuilding(tx, ty, w, h);
	}

	// Player placement also requires proximity to an existing structure.
	canPlayerPlace(tx: number, ty: number, w: number, h: number, type?: BuildingTypeId): boolean {
		return this.placement.canPlayerPlace(tx, ty, w, h, type);
	}

	findSpawnNear(b: Building): Vec2 {
		return this.placement.findSpawnNear(b);
	}

	// economy / power facade
	creditsFor(faction: Faction): number {
		return this.economy.creditsFor(faction);
	}
	addCredits(faction: Faction, amount: number): void {
		this.economy.addCredits(faction, amount);
	}
	spend(faction: Faction, amount: number): boolean {
		return this.economy.spend(faction, amount);
	}
	powerStatus(faction: Faction): { produced: number; consumed: number } {
		return this.economy.powerStatus(faction);
	}

	// player production facade
	hasBuilding(faction: Faction, type: BuildingTypeId): boolean {
		return this.query.hasBuilding(faction, type);
	}

	canBuildStructure(type: BuildingTypeId): { ok: boolean; reason?: string } {
		return this.production.canBuildStructure(type);
	}
	startStructure(type: BuildingTypeId): void {
		this.production.startStructure(type);
	}
	cancelStructure(): void {
		this.production.cancelStructure();
	}
	canTrainUnit(type: UnitTypeId): { ok: boolean; reason?: string } {
		return this.production.canTrainUnit(type);
	}
	startUnit(type: UnitTypeId): void {
		this.production.startUnit(type);
	}

	// World interface
	spawnProjectile(spec: ProjectileSpec): void {
		this.projectiles.push(new Projectile(spec.kind, spec.from, spec.target, spec.damage, spec.splash, spec.faction));
		this.audio.play(spec.kind === 'rocket' ? 'rocket' : 'shoot');
	}

	spawnExplosion(pos: Vec2, radius: number, big: boolean): void {
		this.effects.push(new Effect('explosion', pos, radius, big, (): number => this.rng()));
		this.audio.play(big ? 'explosionBig' : 'explosionSmall');
		if (big && this.fog.isVisibleWorld(pos)) this.screenShake = Math.min(8, this.screenShake + 5);
	}

	spawnMuzzle(pos: Vec2): void {
		this.effects.push(new Effect('muzzle', pos, 4, false, (): number => this.rng()));
	}

	damageArea(pos: Vec2, radius: number, damage: number, faction: Faction): void {
		this.combat.damageArea(pos, radius, damage, faction);
	}

	findNearestEnemy(faction: Faction, pos: Vec2, rangeTiles: number): Entity | null {
		return this.combat.findNearestEnemy(faction, pos, rangeTiles);
	}

	// selection / commands facade
	selectInBox(a: Vec2, b: Vec2, additive: boolean): void {
		this.selection.selectInBox(a, b, additive);
	}

	clearSelection(): void {
		this.selection.clearSelection();
	}

	// Sell the currently selected player building for a health-scaled refund.
	sellSelectedBuilding(): void {
		const b = this.selection.selectedBuilding;
		if (!b || b.faction !== 'player' || b.dead || !b.complete) return;
		this.economy.addCredits('player', b.sellValue);
		b.dead = true;
		this.audio.play('build');
		this.selection.clearSelection();
	}

	unitAt(p: Vec2): Unit | null {
		return this.selection.unitAt(p);
	}

	buildingAt(p: Vec2): Building | null {
		return this.selection.buildingAt(p);
	}

	// Right-click command in the world.
	commandAt(world: Vec2): void {
		this.selection.commandAt(world);
	}

	// main loop
	start(): void {
		this.running = true;
		this.audio.resume();
		this.audio.startMusic();
		this.input.attach();
		let last = performance.now();
		const frame = (now: number): void => {
			if (!this.running) return;
			let dt = (now - last) / 1000;
			last = now;
			dt = Math.min(dt, 0.05);
			this.update(dt);
			this.toast.update(dt);
			this.render();
			requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
	}

	stop(): void {
		this.running = false;
		this.input.detach();
		this.audio.stopMusic();
	}

	// Aborts the current mission and hands control back to the main menu.
	quitToMenu(): void {
		this.setPaused(false);
		this.stop();
		this.onQuit();
	}

	// Pauses or resumes the simulation, notifying the UI.
	setPaused(paused: boolean): void {
		if (this.paused === paused) return;
		this.paused = paused;
		this.onPauseChange(paused);
	}

	// Toggles the pause state (used by the Escape key).
	togglePause(): void {
		this.setPaused(!this.paused);
	}

	private update(dt: number): void {
		if (this.gameOver || this.paused) return;
		this.time += dt;

		this.input.update(dt);
		this.production.update(dt);
		this.ai.update(dt);

		this.map.regrow(dt);

		for (const u of this.units) if (!u.dead) u.update(dt, this);
		for (const b of this.buildings) if (!b.dead) b.update(dt, this);
		for (const p of this.projectiles) if (!p.dead) p.update(dt, this);
		for (const e of this.effects) e.update(dt);

		this.handleDeaths();
		this.cleanup();
		this.updateFog();

		if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - dt * 30);

		this.checkVictory();
	}

	private handleDeaths(): void {
		for (const u of this.units) {
			if (u.dead && !u._deathHandled) {
				u._deathHandled = true;
				this.spawnExplosion(u.pos, u.radius + 6, u.radius > 10);
			}
		}
		for (const b of this.buildings) {
			if (b.dead && !b._deathHandled) {
				b._deathHandled = true;
				for (let y = b.tile.y; y < b.tile.y + b.def.h; y++) for (let x = b.tile.x; x < b.tile.x + b.def.w; x++) this.map.setBlocked(x, y, false);
				this.spawnExplosion(b.pos, b.def.w * TILE * 0.5, true);
				// secondary booms
				this.effects.push(new Effect('explosion', { x: b.pos.x + 8, y: b.pos.y - 6 }, 20, true, (): number => this.rng()));
			}
		}
	}

	private cleanup(): void {
		this.selection.cleanup();
		this.units = this.units.filter((u: Unit): boolean => !u.dead);
		this.buildings = this.buildings.filter((b: Building): boolean => !b.dead);
		this.projectiles = this.projectiles.filter((p: Projectile): boolean => !p.dead);
		this.effects = this.effects.filter((e: Effect): boolean => !e.dead);
	}

	private updateFog(): void {
		const sources: { pos: Vec2; sight: number }[] = [];
		for (const u of this.query.unitsOf('player')) sources.push({ pos: u.pos, sight: u.sight });
		for (const b of this.query.buildingsOf('player')) sources.push({ pos: b.pos, sight: b.sight });
		this.fog.update(sources);
	}

	private checkVictory(): void {
		const playerAny = this.query.buildingsOf('player').length > 0 || this.query.unitsOf('player').length > 0;
		const enemyAny = this.query.buildingsOf('enemy').length > 0 || this.query.unitsOf('enemy').length > 0;
		if (!playerAny) this.end('lose');
		else if (!enemyAny) this.end('win');
	}

	private end(result: 'win' | 'lose'): void {
		if (this.gameOver) return;
		this.gameOver = result;
		this.onEnd(result);
	}

	// placement helper for input
	confirmPlacement(tile: Vec2): void {
		this.production.confirmPlacement(tile);
	}

	get shakeOffset(): Vec2 {
		if (this.screenShake <= 0) return { x: 0, y: 0 };
		return {
			x: (this.rng() - 0.5) * this.screenShake,
			y: (this.rng() - 0.5) * this.screenShake,
		};
	}

	private render(): void {
		this.renderer.render();
		this.hud.render();
		this.toast.render(this.ctx, this.viewW);
	}

	// Shows a transient notification in the top-right corner.
	notify(text: string): void {
		this.toast.push(text);
	}

	// expose for HUD
	factionColor(f: Faction): FactionPalette {
		return FACTION_COLORS[f];
	}
	get harvesterCapacity(): number {
		return HARVESTER_CAPACITY;
	}
	get mapTiles(): { w: number; h: number } {
		return { w: MAP_W, h: MAP_H };
	}
}
