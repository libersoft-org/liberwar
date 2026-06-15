import { BUILDINGS, UNITS } from './core/config.ts';
import { tileCenter } from './map/GameMap.ts';
import { nearest, spiralSearch } from './math/geometry.ts';
import { TILE } from './core/types.ts';
import type { BuildingTypeId, UnitTypeId, Vec2 } from './core/types.ts';
import type { Building } from './entities/Building.ts';
import type { Unit } from './entities/Unit.ts';
import type { Game } from './core/Game.ts';
export type Difficulty = 'easy' | 'medium' | 'hard';
interface DiffParams {
	income: number; // bonus credit multiplier
	thinkInterval: number;
	attackSize: number;
	retaliate: boolean;
}
const PARAMS: Record<Difficulty, DiffParams> = {
	easy: { income: 0.7, thinkInterval: 3.5, attackSize: 4, retaliate: false },
	medium: { income: 1.0, thinkInterval: 2.2, attackSize: 6, retaliate: true },
	hard: { income: 1.4, thinkInterval: 1.4, attackSize: 9, retaliate: true },
};
// Build/training priority order for the enemy.
const BUILD_PLAN: BuildingTypeId[] = ['power', 'refinery', 'barracks', 'factory', 'power', 'turret', 'barracks', 'turret', 'power'];
// Core economy/production structures the AI keeps standing once the opening
// plan is done; any of these lost to a raid is rebuilt (power first, so build
// speed and the factory/turret prerequisite recover before the rest).
const REBUILD_ESSENTIALS: BuildingTypeId[] = ['power', 'refinery', 'barracks', 'factory'];

export class EnemyAI {
	private game: Game;
	private p: DiffParams;
	private timer = 0;
	private attackTimer = 12;
	private army: Unit[] = [];
	private planIndex = 0;
	// structure being produced; placed into the map once timeLeft runs out
	private buildSlot: { type: BuildingTypeId; timeLeft: number } | null = null;
	// unit being trained; spawns once timeLeft runs out (the AI pays the same
	// build time as the player instead of spawning units instantly)
	private trainSlot: { type: UnitTypeId; timeLeft: number } | null = null;

	constructor(game: Game, difficulty: Difficulty) {
		this.game = game;
		this.p = PARAMS[difficulty];
	}

	update(dt: number): void {
		this.timer -= dt;
		this.attackTimer -= dt;
		// passive income trickle so the AI keeps functioning even if harvesters die
		this.game.addCredits('enemy', 12 * this.p.income * dt);
		if (this.buildSlot) {
			// low power slows construction, same as the player's production slot
			this.buildSlot.timeLeft -= dt * this.game.economy.buildSpeed('enemy');
			if (this.buildSlot.timeLeft <= 0) this.placeFinishedBuilding();
		}
		if (this.trainSlot) {
			this.trainSlot.timeLeft -= dt * this.game.economy.buildSpeed('enemy');
			if (this.trainSlot.timeLeft <= 0) this.completeTraining();
		}

		if (this.timer <= 0) {
			this.timer = this.p.thinkInterval;
			this.think();
		}
		this.manageArmy();
	}

	private myBuildings(): Building[] {
		return this.game.query.buildingsOf('enemy');
	}
	private myUnits(): Unit[] {
		return this.game.query.unitsOf('enemy');
	}

	private has(type: BuildingTypeId): boolean {
		return this.game.query.hasBuilding('enemy', type);
	}

	// First essential structure the AI is currently missing, or null if all stand.
	private missingEssential(): BuildingTypeId | null {
		for (const type of REBUILD_ESSENTIALS) if (!this.has(type)) return type;
		return null;
	}

	private think(): void {
		const credits = this.game.creditsFor('enemy');
		const buildings = this.myBuildings();
		const yard = buildings.find((b: Building): boolean => b.typeId === 'yard');
		if (!yard) return;

		// Keep enough harvesters.
		const harvesters = this.myUnits().filter((u: Unit): boolean => u.isHarvester).length;
		if (this.has('refinery') && this.has('factory') && harvesters < 2 && !this.trainSlot && credits >= UNITS.harvester.cost) {
			this.trainEnemy('harvester');
			return;
		}

		// Follow the build plan for structures: pay and wait out the build time
		// (like the player's production slot), then place the finished building.
		if (this.planIndex < BUILD_PLAN.length && !this.buildSlot) {
			const next = BUILD_PLAN[this.planIndex]!;
			const def = BUILDINGS[next];
			const reqMet = !def.requires || def.requires.every((r: BuildingTypeId): boolean => this.has(r));
			if (reqMet && credits >= def.cost && this.game.spend('enemy', def.cost)) {
				this.buildSlot = { type: next, timeLeft: def.buildTime };
				this.planIndex++;
				return;
			}
		}

		// Once the opening plan is complete, keep essential structures standing.
		// planIndex only ever advances, so without this a single successful raid that
		// flattens the refinery/factory/barracks would permanently cripple the AI: it
		// would coast on passive income alone and never rebuild what it lost.
		if (this.planIndex >= BUILD_PLAN.length && !this.buildSlot) {
			const missing = this.missingEssential();
			if (missing) {
				const def = BUILDINGS[missing];
				const reqMet = !def.requires || def.requires.every((r: BuildingTypeId): boolean => this.has(r));
				if (reqMet && credits >= def.cost && this.game.spend('enemy', def.cost)) {
					this.buildSlot = { type: missing, timeLeft: def.buildTime };
					return;
				}
			}
		}

		// Train combat units with spare cash (one at a time, like the player's queue head).
		if (credits > 500 && !this.trainSlot) {
			const roster: UnitTypeId[] = [];
			if (this.has('barracks')) {
				roster.push('infantry');
				if (this.has('factory')) roster.push('rocketeer');
			}
			if (this.has('factory')) {
				roster.push('lighttank');
				if (this.has('power')) roster.push('heavytank');
			}
			if (roster.length > 0) {
				const pick = roster[Math.floor(this.game.rng() * roster.length)]!;
				if (credits >= UNITS[pick].cost) this.trainEnemy(pick);
			}
		}
	}

	// Pays for the unit and starts the training timer; the unit spawns in
	// completeTraining once the build time elapses.
	private trainEnemy(type: UnitTypeId): void {
		if (this.trainSlot) return;
		const def = UNITS[type];
		if (!this.myBuildings().some((b: Building): boolean => b.typeId === def.from)) return;
		if (!this.game.spend('enemy', def.cost)) return;
		this.trainSlot = { type, timeLeft: def.buildTime };
	}

	private completeTraining(): void {
		const slot = this.trainSlot;
		if (!slot) return;
		this.trainSlot = null;
		const def = UNITS[slot.type];
		const from = this.myBuildings().find((b: Building): boolean => b.typeId === def.from);
		if (!from) {
			// production building lost mid-training: refund, same as the player
			this.game.addCredits('enemy', def.cost);
			return;
		}
		const spawn = this.game.findSpawnNear(from);
		const u = this.game.spawnUnit(slot.type, 'enemy', spawn);
		if (u.isHarvester) u.orderHarvest(this.game);
		else this.army.push(u);
	}

	// Places the finished structure near the yard; retries later if blocked.
	private placeFinishedBuilding(): void {
		const slot = this.buildSlot;
		if (!slot) return;
		const def = BUILDINGS[slot.type];
		const yard = this.myBuildings().find((b: Building): boolean => b.typeId === 'yard');
		if (!yard) {
			// yard lost; refund and drop the order
			this.game.addCredits('enemy', def.cost);
			this.buildSlot = null;
			return;
		}
		// search a free footprint spiralling out from the yard
		const spot = spiralSearch(yard.tile.x, yard.tile.y, (tx: number, ty: number): boolean => this.game.canPlaceBuilding(tx, ty, def.w, def.h), { minR: 2, maxR: 14, steps: 16 });
		if (!spot) {
			slot.timeLeft = this.p.thinkInterval;
			return;
		}
		this.game.placeBuilding(slot.type, 'enemy', spot);
		this.buildSlot = null;
	}

	// Reactive defence: the nearest armed player unit that has pushed into the
	// enemy base, or null when none is close enough. Drives retaliation; easy AI
	// never calls this so it only ever mounts scheduled attacks.
	private detectIntruder(): Unit | null {
		const yard = this.game.query.firstBuilding('enemy', 'yard');
		if (!yard) return null;
		return nearest<Unit>(yard.pos, (u: Unit): boolean => !!u.def.weapon, 16 * TILE, [this.game.query.unitsOf('player')]);
	}

	private manageArmy(): void {
		this.army = this.army.filter((u: Unit): boolean => !u.dead);

		// Scheduled offensive: once enough troops have massed and the cooldown is
		// up, throw the whole army at the player base (or any remaining player
		// entity) and forget about it.
		if (this.attackTimer <= 0 && this.army.length >= this.p.attackSize) {
			const playerYard = this.game.query.firstBuilding('player', 'yard');
			let target: Vec2 | null = null;
			if (playerYard) target = playerYard.pos;
			else {
				const anyPlayer = this.game.query.unitsOf('player')[0] ?? this.game.query.buildingsOf('player')[0];
				if (anyPlayer) target = anyPlayer.pos;
			}
			if (target) {
				for (const u of this.army) u.orderAttackMove(target, this.game);
				this.army = [];
				this.attackTimer = 25 + this.game.rng() * 15;
			}
			return;
		}

		// Reactive defence: medium/hard send the idle army to intercept an armed
		// player unit that strays into the base. Easy never retaliates.
		if (this.p.retaliate) {
			const intruder = this.detectIntruder();
			if (intruder) {
				for (const u of this.army) if (u.order === 'idle' || u.order === 'move') u.orderAttackMove(intruder.pos, this.game);
				return;
			}
		}

		// Otherwise the idle army loosely gathers near the enemy yard.
		const yard = this.game.query.firstBuilding('enemy', 'yard');
		if (yard) {
			for (const u of this.army) {
				if (u.order === 'idle' && u.path.length === 0) {
					const t = tileCenter(yard.tile.x + 3 + Math.floor(this.game.rng() * 3), yard.tile.y + Math.floor(this.game.rng() * 5));
					u.orderMove(t, this.game);
				}
			}
		}
	}
}
