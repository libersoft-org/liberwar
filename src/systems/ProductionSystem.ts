import { BUILDINGS, UNITS } from '../core/config.ts';
import { t } from '../lang/lang.ts';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { EconomySystem } from './EconomySystem.ts';
import type { BuildingTypeId, Faction, UnitTypeId, Vec2 } from '../core/types.ts';
import type { World } from '../core/world.ts';
import type { Building } from '../entities/Building.ts';
import type { Unit } from '../entities/Unit.ts';

export interface StructureSlot {
	type: BuildingTypeId;
	timeLeft: number;
	total: number;
	ready: boolean;
}
export interface UnitSlot {
	type: UnitTypeId;
	timeLeft: number;
	total: number;
}

// Services the production system needs from the game world.
export interface ProductionHost {
	economy: EconomySystem;
	audio: AudioEngine;
	hasBuilding(faction: Faction, type: BuildingTypeId): boolean;
	buildings: Building[];
	spawnUnit(type: UnitTypeId, faction: Faction, pos: Vec2): Unit;
	placeBuilding(type: BuildingTypeId, faction: Faction, tile: Vec2, instant: boolean): Building;
	findSpawnNear(b: Building): Vec2;
	canPlayerPlace(tx: number, ty: number, w: number, h: number, type?: BuildingTypeId): boolean;
	notify(text: string): void;
}

/**
 * Manages the player's build/train pipeline: one structure slot (built then
 * placed manually) plus per-building-type unit queues.
 */
export class ProductionSystem {
	structureSlot: StructureSlot | null = null;
	unitQueues: Record<string, UnitSlot[]> = { barracks: [], factory: [] };
	pendingPlacement: BuildingTypeId | null = null;

	private host: ProductionHost & World;

	constructor(host: ProductionHost & World) {
		this.host = host;
	}

	// validation
	canBuildStructure(type: BuildingTypeId): { ok: boolean; reason?: string } {
		const def = BUILDINGS[type];
		// Only a single construction yard may exist at a time.
		if (type === 'yard' && this.host.hasBuilding('player', 'yard')) return { ok: false, reason: t('reason.onlyOne') };
		if (def.requires) for (const req of def.requires) if (!this.host.hasBuilding('player', req)) return { ok: false, reason: t('reason.requires', { name: t(`building.${req}`) }) };
		if (!this.host.economy.canAfford('player', def.cost)) return { ok: false, reason: t('reason.credits') };
		return { ok: true };
	}

	canTrainUnit(type: UnitTypeId): { ok: boolean; reason?: string } {
		const def = UNITS[type];
		if (!this.host.hasBuilding('player', def.from))
			return {
				ok: false,
				reason: t('reason.requires', { name: t(`building.${def.from}`) }),
			};
		if (def.requires && !this.host.hasBuilding('player', def.requires))
			return {
				ok: false,
				reason: t('reason.requires', { name: t(`building.${def.requires}`) }),
			};
		if (!this.host.economy.canAfford('player', def.cost)) return { ok: false, reason: t('reason.credits') };
		return { ok: true };
	}

	// structures
	startStructure(type: BuildingTypeId): void {
		// If already produced & waiting, enter placement mode.
		if (this.structureSlot?.ready && this.structureSlot.type === type) {
			this.pendingPlacement = type;
			return;
		}
		if (this.structureSlot) {
			this.host.notify(t(this.structureSlot.ready ? 'reason.ready' : 'reason.busy'));
			this.host.audio.play('deny');
			return;
		}
		const check = this.canBuildStructure(type);
		if (!check.ok) {
			if (check.reason) this.host.notify(check.reason);
			this.host.audio.play('deny');
			return;
		}
		const def = BUILDINGS[type];
		if (!this.host.economy.spend('player', def.cost)) return;
		this.structureSlot = {
			type,
			timeLeft: def.buildTime,
			total: def.buildTime,
			ready: false,
		};
		this.host.audio.play('build');
	}

	cancelStructure(): void {
		if (!this.structureSlot) return;
		this.host.economy.addCredits('player', BUILDINGS[this.structureSlot.type].cost);
		this.structureSlot = null;
		this.pendingPlacement = null;
	}

	confirmPlacement(tile: Vec2): void {
		if (!this.pendingPlacement || !this.structureSlot?.ready) return;
		const def = BUILDINGS[this.pendingPlacement];
		if (this.host.canPlayerPlace(tile.x, tile.y, def.w, def.h, this.pendingPlacement)) {
			this.host.placeBuilding(this.pendingPlacement, 'player', tile, false);
			this.host.audio.play('build');
			this.pendingPlacement = null;
			this.structureSlot = null;
		} else {
			this.host.audio.play('deny');
		}
	}

	// units
	startUnit(type: UnitTypeId): void {
		const check = this.canTrainUnit(type);
		if (!check.ok) {
			if (check.reason) this.host.notify(check.reason);
			this.host.audio.play('deny');
			return;
		}
		const def = UNITS[type];
		if (!this.host.economy.spend('player', def.cost)) return;
		const queue = this.unitQueues[def.from] ?? (this.unitQueues[def.from] = []);
		queue.push({ type, timeLeft: def.buildTime, total: def.buildTime });
		this.host.audio.play('build');
	}

	// tick
	update(dt: number): void {
		const speed = this.host.economy.buildSpeed('player');

		if (this.structureSlot && !this.structureSlot.ready) {
			this.structureSlot.timeLeft -= dt * speed;
			if (this.structureSlot.timeLeft <= 0) {
				this.structureSlot.timeLeft = 0;
				this.structureSlot.ready = true;
				this.host.audio.play('complete');
			}
		}

		for (const key of Object.keys(this.unitQueues)) {
			const q = this.unitQueues[key];
			if (!q || q.length === 0) continue;
			const slot = q[0]!;
			slot.timeLeft -= dt * speed;
			if (slot.timeLeft <= 0) {
				q.shift();
				this.completeUnit(slot.type);
			}
		}
	}

	private completeUnit(type: UnitTypeId): void {
		const def = UNITS[type];
		const from = this.host.buildings.find((b: Building): boolean => b.faction === 'player' && b.typeId === def.from && b.complete && !b.dead);
		if (!from) {
			this.host.economy.addCredits('player', def.cost); // refund if building lost
			return;
		}
		const u = this.host.spawnUnit(type, 'player', this.host.findSpawnNear(from));
		this.host.audio.play('complete');
		if (u.isHarvester) u.orderHarvest(this.host);
		else if (from.rally) u.orderMove(from.rally, this.host);
	}
}
