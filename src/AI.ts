import { BUILDINGS, UNITS } from './core/config.ts';
import { tileCenter } from './map/GameMap.ts';
import { spiralSearch } from './math/geometry.ts';
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

export class EnemyAI {
	private game: Game;
	private p: DiffParams;
	private timer = 0;
	private attackTimer = 12;
	private army: Unit[] = [];
	private planIndex = 0;

	constructor(game: Game, difficulty: Difficulty) {
		this.game = game;
		this.p = PARAMS[difficulty];
	}

	update(dt: number): void {
		this.timer -= dt;
		this.attackTimer -= dt;
		// passive income trickle so the AI keeps functioning even if harvesters die
		this.game.addCredits('enemy', 12 * this.p.income * dt);

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

	private think(): void {
		const credits = this.game.creditsFor('enemy');
		const buildings = this.myBuildings();
		const yard = buildings.find((b: Building): boolean => b.typeId === 'yard');
		if (!yard) return;

		// Keep enough harvesters.
		const harvesters = this.myUnits().filter((u: Unit): boolean => u.isHarvester).length;
		if (this.has('refinery') && this.has('factory') && harvesters < 2 && credits >= UNITS.harvester.cost) {
			this.trainEnemy('harvester');
			return;
		}

		// Follow the build plan for structures.
		if (this.planIndex < BUILD_PLAN.length) {
			const next = BUILD_PLAN[this.planIndex]!;
			const def = BUILDINGS[next];
			const reqMet = !def.requires || def.requires.every((r: BuildingTypeId): boolean => this.has(r));
			if (reqMet && credits >= def.cost) {
				if (this.placeEnemyBuilding(next, yard)) {
					this.planIndex++;
					return;
				}
			} else if (!reqMet) {
				// skip ahead is not allowed; wait for requirement
			}
		}

		// Train combat units with spare cash.
		if (credits > 500) {
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

	private trainEnemy(type: UnitTypeId): void {
		const def = UNITS[type];
		const from = this.myBuildings().find((b: Building): boolean => b.typeId === def.from && b.complete);
		if (!from) return;
		if (!this.game.spend('enemy', def.cost)) return;
		const spawn = this.game.findSpawnNear(from);
		const u = this.game.spawnUnit(type, 'enemy', spawn);
		if (u.isHarvester) u.orderHarvest(this.game);
		else this.army.push(u);
	}

	private placeEnemyBuilding(type: BuildingTypeId, yard: Building): boolean {
		const def = BUILDINGS[type];
		// search a free footprint spiralling out from the yard
		const spot = spiralSearch(yard.tile.x, yard.tile.y, (tx: number, ty: number): boolean => this.game.canPlaceBuilding(tx, ty, def.w, def.h), { minR: 2, maxR: 14, steps: 16 });
		if (!spot) return false;
		if (!this.game.spend('enemy', def.cost)) return false;
		this.game.placeBuilding(type, 'enemy', spot, false);
		return true;
	}

	private manageArmy(): void {
		this.army = this.army.filter((u: Unit): boolean => !u.dead);
		const playerYard = this.game.query.firstBuilding('player', 'yard');
		if (this.attackTimer <= 0 && this.army.length >= this.p.attackSize) {
			// launch an attack at the player base / nearest player entity
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
		} else {
			// idle army gathers near the enemy yard
			const yard = this.game.query.firstBuilding('enemy', 'yard');
			if (yard) {
				for (const u of this.army) {
					if (u.order === 'idle' && u.path.length === 0) {
						const t = tileCenter(yard.tile.x + 3 + Math.floor(this.game.rng() * 3), yard.tile.y + Math.floor(this.game.rng() * 5));
						void TILE;
						u.orderMove(t, this.game);
					}
				}
			}
		}
	}
}
