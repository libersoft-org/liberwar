import { findPath } from '../map/Pathfinding.ts';
import { tileCenter, worldToTile } from '../map/GameMap.ts';
import { HARVESTER_CAPACITY, HARVEST_RATE, UNITS } from '../core/config.ts';
import { TILE } from '../core/types.ts';
import type { Faction, UnitDef, UnitTypeId, Vec2 } from '../core/types.ts';
import type { Entity, World } from '../core/world.ts';
import { fireWeapon } from '../combat/Weapon.ts';
import { nearest } from '../math/geometry.ts';
import { angleTo, dist } from '../math/vec.ts';
import { GameObject } from './GameObject.ts';
import type { Building } from './Building.ts';

export type UnitOrderKind = 'idle' | 'move' | 'attack' | 'attackMove' | 'harvest';

let nextId = 1;

export class Unit extends GameObject {
	readonly kind = 'unit' as const;
	typeId: UnitTypeId;
	def: UnitDef;

	// facing angle in radians (for rendering turret/body)
	facing = 0;
	turret = 0;

	// movement
	path: Vec2[] = [];
	pathTarget: Vec2 | null = null;
	vel: Vec2 = { x: 0, y: 0 };

	// orders
	order: UnitOrderKind = 'idle';
	moveGoal: Vec2 | null = null;
	// original attack-move destination; moveGoal gets overwritten while chasing targets
	attackMoveGoal: Vec2 | null = null;
	attackTarget: Entity | null = null;
	cooldown = 0;
	repathTimer = 0;
	// Set while walking out from under a freshly placed building; a harvester
	// re-issues its harvest order when the walk completes.
	private resumeHarvestOnArrival = false;

	// harvester state
	harvestLoad = 0;
	harvestState: 'seek' | 'harvesting' | 'returning' | 'unloading' = 'seek';
	harvestTile: Vec2 | null = null;
	homeRefinery: Building | null = null;
	unloadTimer = 0;
	// cooldown between harvest-target scans; avoids a full-map scan every frame
	// when nothing is left to harvest
	harvestSearchTimer = 0;

	constructor(typeId: UnitTypeId, faction: Faction, pos: Vec2) {
		const def = UNITS[typeId];
		super(nextId++, faction, pos, def.hp, def.radius, def.sight);
		this.typeId = typeId;
		this.def = def;
	}

	get isHarvester(): boolean {
		return !!this.def.isHarvester;
	}

	// order API
	orderMove(goal: Vec2, world: World): void {
		this.order = 'move';
		this.attackTarget = null;
		this.attackMoveGoal = null;
		this.setDestination(goal, world);
	}

	orderAttackMove(goal: Vec2, world: World): void {
		this.order = 'attackMove';
		this.attackTarget = null;
		this.attackMoveGoal = { ...goal };
		this.setDestination(goal, world);
	}

	orderAttack(target: Entity, world: World): void {
		if (!this.def.weapon) {
			this.orderMove(target.pos, world);
			return;
		}
		this.order = 'attack';
		this.attackTarget = target;
	}

	orderHarvest(world: World, tile?: Vec2): void {
		if (!this.isHarvester) return;
		this.order = 'harvest';
		this.attackTarget = null;
		this.harvestState = 'seek';
		this.harvestTile = tile ?? null;
		this.harvestSearchTimer = 0;
		if (tile) this.setDestination(tileCenter(tile.x, tile.y), world);
	}

	// Sends the harvester to a specific refinery to unload its current load.
	orderUnload(world: World, refinery: Building): void {
		if (!this.isHarvester) return;
		this.order = 'harvest';
		this.attackTarget = null;
		this.harvestState = 'returning';
		this.homeRefinery = refinery;
		this.setDestination(refinery.pos, world);
	}

	// Forced relocation after a building was placed on this unit's tile. Walks
	// straight to `goal`, bypassing A* (it cannot route from a blocked start
	// tile); a harvester resumes its harvest order once it arrives.
	evictTo(goal: Vec2): void {
		const resumeHarvest = this.isHarvester && this.order === 'harvest';
		this.stop();
		this.order = 'move';
		this.moveGoal = { ...goal };
		this.pathTarget = { ...goal };
		this.path = [{ ...goal }];
		this.resumeHarvestOnArrival = resumeHarvest;
	}

	stop(): void {
		this.order = 'idle';
		this.path = [];
		this.pathTarget = null;
		this.moveGoal = null;
		this.attackMoveGoal = null;
		this.vel = { x: 0, y: 0 };
		this.resumeHarvestOnArrival = false;
	}

	private setDestination(goal: Vec2, world: World): void {
		this.resumeHarvestOnArrival = false;
		this.moveGoal = { ...goal };
		const start = worldToTile(this.pos);
		const end = worldToTile(goal);
		const tilePath = findPath(world.map, start, end);
		this.path = tilePath.map((t: Vec2): Vec2 => tileCenter(t.x, t.y));
		this.pathTarget = goal;
		this.repathTimer = 0.6 + world.rng() * 0.4;
	}

	// update
	update(dt: number, world: World): void {
		if (this.cooldown > 0) this.cooldown -= dt;
		if (this.repathTimer > 0) this.repathTimer -= dt;
		if (this.harvestSearchTimer > 0) this.harvestSearchTimer -= dt;

		if (this.isHarvester) {
			// Only harvest autonomously when explicitly ordered to; a manual move
			// order keeps the harvester wherever the player sends it.
			if (this.order === 'harvest') this.updateHarvester(dt, world);
			else this.updateCombat(dt, world);
		} else {
			this.updateCombat(dt, world);
		}
		this.moveAlongPath(dt, world);
	}

	private updateCombat(dt: number, world: World): void {
		// Auto-acquire targets when idle / attack-moving.
		if (this.def.weapon) {
			if (this.order === 'attack' && this.attackTarget) {
				if (this.attackTarget.dead) {
					this.attackTarget = null;
					this.stop();
				}
			} else if (this.order === 'idle' || this.order === 'attackMove') {
				if (this.attackTarget?.dead) this.attackTarget = null;
				const enemy = world.findNearestEnemy(this.faction, this.pos, this.def.sight);
				if (enemy) {
					this.attackTarget = enemy;
					if (this.order === 'idle') this.order = 'attack';
				}
			}
		}

		if (this.attackTarget && !this.attackTarget.dead) {
			const t = this.attackTarget;
			const d = dist(t.pos, this.pos);
			const rangePx = (this.def.weapon?.range ?? 0) * TILE + t.radius;
			this.turret = angleTo(this.pos, t.pos);
			if (d <= rangePx) {
				// in range: stop, face the target and fire. Units are single
				// sprites rendered by `facing`, so turn the body, not just the
				// (never rendered) turret angle.
				this.path = [];
				this.pathTarget = null;
				this.facing = this.turret;
				if (this.cooldown <= 0) this.fire(t, world);
			} else if (this.order === 'attack' || this.order === 'attackMove') {
				// chase
				if (this.repathTimer <= 0 || this.path.length === 0) this.setDestination(t.pos, world);
			}
			void dt;
		} else if (this.order === 'attackMove' && this.attackMoveGoal) {
			// no target in sight: resume advancing toward the attack-move goal
			if (dist(this.attackMoveGoal, this.pos) <= TILE) this.stop();
			else if (this.path.length === 0 && this.repathTimer <= 0) {
				this.setDestination(this.attackMoveGoal, world);
				// goal unreachable: give up instead of retrying forever
				if (this.path.length === 0) this.stop();
			}
		}
	}

	private fire(target: Entity, world: World): void {
		const weapon = this.def.weapon;
		if (!weapon) return;
		this.cooldown = weapon.cooldown;
		fireWeapon(world, this, this.turret, target, weapon);
	}

	// harvester logic
	private updateHarvester(dt: number, world: World): void {
		switch (this.harvestState) {
			case 'seek': {
				if (!this.harvestTile || world.map.harvestAt(this.harvestTile.x, this.harvestTile.y) <= 5) {
					// current target is gone; wait out the scan cooldown before
					// searching again (scans are expensive on a depleted map)
					if (this.harvestSearchTimer > 0) {
						this.path = [];
						return;
					}
					const found = world.map.findHarvest(this.pos, 34);
					if (found) {
						this.harvestTile = found;
						this.setDestination(tileCenter(found.x, found.y), world);
					} else {
						// nothing worth harvesting; idle and retry in a while
						this.harvestTile = null;
						this.harvestSearchTimer = 2;
						this.path = [];
						return;
					}
				}
				// arrived?
				const tc = tileCenter(this.harvestTile.x, this.harvestTile.y);
				const dToTile = dist(tc, this.pos);
				if (dToTile < TILE * 0.7) {
					this.harvestState = 'harvesting';
					this.path = [];
				} else if (this.path.length === 0) {
					if (this.repathTimer <= 0) this.setDestination(tc, world);
					// close enough but blocked from the exact centre: start harvesting anyway
					if (this.path.length === 0 && dToTile < TILE * 1.6) this.harvestState = 'harvesting';
				}
				break;
			}
			case 'harvesting': {
				if (!this.harvestTile) {
					this.harvestState = 'seek';
					break;
				}
				const want = Math.min(HARVEST_RATE * dt, HARVESTER_CAPACITY - this.harvestLoad);
				const got = world.map.takeHarvest(this.harvestTile.x, this.harvestTile.y, want);
				this.harvestLoad += got;
				// Leave once the tile is effectively empty. The regrow trickle refills a
				// tiny amount every frame, so `got` never reaches zero; check the
				// remaining tile value instead (same threshold as seek/findHarvest).
				if (world.map.harvestAt(this.harvestTile.x, this.harvestTile.y) <= 5) {
					// tile depleted, look for an adjacent harvest tile
					this.harvestState = 'seek';
					this.harvestTile = null;
				}
				if (this.harvestLoad >= HARVESTER_CAPACITY) {
					this.harvestState = 'returning';
					this.homeRefinery = this.findRefinery(world);
					if (this.homeRefinery) this.setDestination(this.homeRefinery.pos, world);
				}
				break;
			}
			case 'returning': {
				if (!this.homeRefinery || this.homeRefinery.dead) {
					this.homeRefinery = this.findRefinery(world);
					if (!this.homeRefinery) {
						// no refinery available; keep the load and wait near current spot
						this.harvestState = this.harvestLoad > 0 ? 'returning' : 'seek';
						this.path = [];
						return;
					}
					this.setDestination(this.homeRefinery.pos, world);
				}
				const d = dist(this.homeRefinery.pos, this.pos);
				// Dock once we're near the refinery footprint. Because the building
				// centre is blocked, pathfinding leaves us on an adjacent tile, so use
				// a generous radius and also dock if we simply can't get any closer.
				const dockRange = this.homeRefinery.radius + TILE * 1.6;
				if (d < dockRange) {
					this.harvestState = 'unloading';
					this.unloadTimer = 0;
					this.path = [];
				} else if (this.path.length === 0) {
					if (this.repathTimer <= 0) this.setDestination(this.homeRefinery.pos, world);
					// Arrived at the closest reachable tile but still outside dockRange:
					// dock anyway so the harvester never gets stuck idling.
					if (this.path.length === 0 && d < this.homeRefinery.radius + TILE * 3) {
						this.harvestState = 'unloading';
						this.unloadTimer = 0;
					}
				}
				break;
			}
			case 'unloading': {
				this.unloadTimer += dt;
				const rate = HARVESTER_CAPACITY / 1.6; // empties in ~1.6s
				const give = Math.min(this.harvestLoad, rate * dt);
				this.harvestLoad -= give;
				world.addCredits(this.faction, give);
				if (this.harvestLoad <= 0.5) {
					// hand over the leftover fraction so the full load becomes credits
					if (this.harvestLoad > 0) world.addCredits(this.faction, this.harvestLoad);
					this.harvestLoad = 0;
					this.harvestState = 'seek';
					this.harvestTile = null;
				}
				break;
			}
		}
	}

	private findRefinery(world: World): Building | null {
		return nearest<Building>(this.pos, (b: Building): boolean => !b.dead && b.faction === this.faction && b.typeId === 'refinery', Infinity, [world.buildings]);
	}

	// steering
	private moveAlongPath(dt: number, world: World): void {
		if (this.path.length === 0) {
			// A move order with no path can never finish on its own (plain moves
			// are never repathed): the goal was unreachable or already met. Flip
			// to idle so auto-engage in updateCombat works again.
			if (this.order === 'move') {
				this.order = 'idle';
				this.moveGoal = null;
				if (this.resumeHarvestOnArrival) {
					this.resumeHarvestOnArrival = false;
					this.orderHarvest(world);
				}
			}
			this.vel.x *= 0.6;
			this.vel.y *= 0.6;
			return;
		}
		const node = this.path[0]!;
		let dx = node.x - this.pos.x;
		let dy = node.y - this.pos.y;
		const d = Math.hypot(dx, dy);
		const arrive = this.isHarvester ? TILE * 0.4 : TILE * 0.35;
		if (d < arrive) {
			this.path.shift();
			if (this.path.length === 0) {
				if (this.order === 'move') this.order = 'idle';
				if (this.resumeHarvestOnArrival) {
					this.resumeHarvestOnArrival = false;
					this.orderHarvest(world);
				}
			}
			return;
		}
		dx /= d;
		dy /= d;
		const speed = this.def.speed * TILE;
		// separation from nearby units to avoid stacking
		let sx = 0;
		let sy = 0;
		for (const o of world.units) {
			if (o === this || o.dead) continue;
			const odx = this.pos.x - o.pos.x;
			const ody = this.pos.y - o.pos.y;
			const od = Math.hypot(odx, ody);
			const min = this.radius + o.radius;
			if (od > 0 && od < min) {
				const push = (min - od) / min;
				sx += (odx / od) * push;
				sy += (ody / od) * push;
			}
		}
		const moveX = dx + sx * 0.9;
		const moveY = dy + sy * 0.9;
		const ml = Math.hypot(moveX, moveY) || 1;
		this.vel.x = (moveX / ml) * speed;
		this.vel.y = (moveY / ml) * speed;
		this.facing = Math.atan2(dy, dx);
		if (!this.def.weapon || !this.attackTarget) this.turret = this.facing;

		let nx = this.pos.x + this.vel.x * dt;
		let ny = this.pos.y + this.vel.y * dt;
		// Block against impassable terrain and building footprints. When the
		// unit's own tile is already blocked (a building was just placed on top
		// of it), footprints are ignored so the unit can walk out.
		const cur = worldToTile(this.pos);
		const onBlocked = !world.map.passable(cur.x, cur.y);
		const free = (px: number, py: number): boolean => (onBlocked ? world.map.passableTerrain(px, py) : world.map.passable(px, py));
		const tt = worldToTile({ x: nx, y: ny });
		if (!free(tt.x, tt.y)) {
			// try axis-separated movement
			const tx = worldToTile({ x: nx, y: this.pos.y });
			const ty = worldToTile({ x: this.pos.x, y: ny });
			if (free(tx.x, tx.y)) ny = this.pos.y;
			else if (free(ty.x, ty.y)) nx = this.pos.x;
			else {
				nx = this.pos.x;
				ny = this.pos.y;
				this.repathTimer = 0;
			}
		}
		this.pos.x = nx;
		this.pos.y = ny;
	}
}
