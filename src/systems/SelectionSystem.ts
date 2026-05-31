import { worldToTile } from '../map/GameMap.ts';
import { TILE } from '../core/types.ts';
import { dist } from '../math/vec.ts';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { GameMap } from '../map/GameMap.ts';
import type { Vec2 } from '../core/types.ts';
import type { World } from '../core/world.ts';
import type { Building } from '../entities/Building.ts';
import type { Unit } from '../entities/Unit.ts';

// Services the selection system needs from the game world.
export interface SelectionHost {
	units: Unit[];
	buildings: Building[];
	map: GameMap;
	audio: AudioEngine;
}

// Owns the player's current selection and translates clicks into orders.
export class SelectionSystem {
	selectedUnits: Unit[] = [];
	selectedBuilding: Building | null = null;
	selectedHarvestTile: Vec2 | null = null;

	private host: SelectionHost & World;

	constructor(host: SelectionHost & World) {
		this.host = host;
	}

	selectInBox(a: Vec2, b: Vec2, additive: boolean): void {
		const minX = Math.min(a.x, b.x);
		const maxX = Math.max(a.x, b.x);
		const minY = Math.min(a.y, b.y);
		const maxY = Math.max(a.y, b.y);
		if (!additive) this.clearSelection();
		const tiny = Math.hypot(maxX - minX, maxY - minY) < 6;
		if (tiny) {
			// single click: pick topmost entity under cursor
			const u = this.unitAt({ x: minX, y: minY });
			if (u && u.faction === 'player') {
				this.selectedUnits = [u];
				this.host.audio.play('select');
				return;
			}
			const b2 = this.buildingAt({ x: minX, y: minY });
			if (b2) {
				this.selectedBuilding = b2;
				this.selectedUnits = [];
				this.host.audio.play('select');
				return;
			}
			// a harvest tile shows its remaining amount
			const tile = worldToTile({ x: minX, y: minY });
			if (this.host.map.harvestAt(tile.x, tile.y) > 5) {
				this.selectedHarvestTile = tile;
				this.host.audio.play('select');
			}
			return;
		}
		let any = false;
		for (const u of this.host.units) {
			if (u.faction !== 'player' || u.dead) continue;
			if (u.pos.x >= minX && u.pos.x <= maxX && u.pos.y >= minY && u.pos.y <= maxY) {
				if (!this.selectedUnits.includes(u)) this.selectedUnits.push(u);
				any = true;
			}
		}
		if (any) {
			this.selectedBuilding = null;
			this.host.audio.play('select');
		}
	}

	clearSelection(): void {
		this.selectedUnits = [];
		this.selectedBuilding = null;
		this.selectedHarvestTile = null;
	}

	unitAt(p: Vec2): Unit | null {
		let best: Unit | null = null;
		let bestD = Infinity;
		for (const u of this.host.units) {
			if (u.dead) continue;
			const d = dist(u.pos, p);
			if (d <= u.radius + 4 && d < bestD) {
				bestD = d;
				best = u;
			}
		}
		return best;
	}

	buildingAt(p: Vec2): Building | null {
		for (const b of this.host.buildings) {
			if (b.dead) continue;
			const x0 = b.tile.x * TILE;
			const y0 = b.tile.y * TILE;
			if (p.x >= x0 && p.x <= x0 + b.def.w * TILE && p.y >= y0 && p.y <= y0 + b.def.h * TILE) return b;
		}
		return null;
	}

	// Right-click command in the world.
	commandAt(world: Vec2): void {
		if (this.selectedUnits.length === 0) {
			if (this.selectedBuilding && this.selectedBuilding.faction === 'player') {
				this.selectedBuilding.rally = { ...world };
				this.host.audio.play('move');
			}
			return;
		}
		const enemyU = this.unitAt(world);
		const enemyB = enemyU ? null : this.buildingAt(world);
		const target = (enemyU && enemyU.faction === 'enemy' ? enemyU : null) ?? (enemyB && enemyB.faction === 'enemy' ? enemyB : null);

		if (target) {
			for (const u of this.selectedUnits) u.orderAttack(target, this.host);
			this.host.audio.play('move');
			return;
		}

		// harvester + harvest tile?
		const tile = worldToTile(world);
		const harvest = this.host.map.harvestAt(tile.x, tile.y);
		const harvesters = this.selectedUnits.filter((u: Unit): boolean => u.isHarvester);
		if (harvest > 5 && harvesters.length > 0) {
			for (const h of harvesters) h.orderHarvest(this.host, tile);
			this.host.audio.play('move');
			const others = this.selectedUnits.filter((u: Unit): boolean => !u.isHarvester);
			this.issueMove(others, world);
			return;
		}

		this.issueMove(this.selectedUnits, world);
		this.host.audio.play('move');
	}

	private issueMove(units: Unit[], center: Vec2): void {
		if (units.length === 0) return;
		// simple grid formation around the target point
		const cols = Math.ceil(Math.sqrt(units.length));
		const spacing = TILE;
		units.forEach((u: Unit, i: number): void => {
			const cx = i % cols;
			const cy = Math.floor(i / cols);
			const offX = (cx - (cols - 1) / 2) * spacing;
			const offY = (cy - (cols - 1) / 2) * spacing;
			u.orderMove({ x: center.x + offX, y: center.y + offY }, this.host);
		});
	}

	// Drops dead entities from the selection.
	cleanup(): void {
		this.selectedUnits = this.selectedUnits.filter((u: Unit): boolean => !u.dead);
		if (this.selectedBuilding?.dead) this.selectedBuilding = null;
		if (this.selectedHarvestTile && this.host.map.harvestAt(this.selectedHarvestTile.x, this.selectedHarvestTile.y) <= 5) this.selectedHarvestTile = null;
	}
}
