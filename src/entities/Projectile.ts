import { TILE } from '../core/types.ts';
import { angleTo, dist } from '../math/vec.ts';
import type { Faction, Vec2 } from '../core/types.ts';
import type { Entity, World } from '../core/world.ts';

export class Projectile {
	kind: 'bullet' | 'rocket';
	pos: Vec2;
	target: Entity | Vec2;
	targetPos: Vec2;
	damage: number;
	splash: number;
	faction: Faction;
	speed: number;
	dead = false;
	angle = 0;
	trail: Vec2[] = [];

	constructor(kind: 'bullet' | 'rocket', from: Vec2, target: Entity | Vec2, damage: number, splash: number, faction: Faction) {
		this.kind = kind;
		this.pos = { ...from };
		this.target = target;
		this.damage = damage;
		this.splash = splash;
		this.faction = faction;
		this.speed = (kind === 'rocket' ? 7 : 16) * TILE;
		this.targetPos = this.resolveTarget();
		this.angle = angleTo(from, this.targetPos);
	}

	private resolveTarget(): Vec2 {
		const t = this.target as Entity;
		if (t && typeof t === 'object' && 'pos' in t) return { x: t.pos.x, y: t.pos.y };
		return { x: (this.target as Vec2).x, y: (this.target as Vec2).y };
	}

	update(dt: number, world: World): void {
		// home toward live entity targets (rockets track, bullets keep last pos)
		const t = this.target as Entity;
		if (t && 'hp' in t && !t.dead && this.kind === 'rocket') this.targetPos = { x: t.pos.x, y: t.pos.y };
		const dx = this.targetPos.x - this.pos.x;
		const dy = this.targetPos.y - this.pos.y;
		const remaining = Math.hypot(dx, dy);
		const step = this.speed * dt;
		this.angle = Math.atan2(dy, dx);

		if (this.kind === 'rocket') {
			this.trail.push({ x: this.pos.x, y: this.pos.y });
			if (this.trail.length > 8) this.trail.shift();
		}

		if (remaining <= step) {
			this.pos.x = this.targetPos.x;
			this.pos.y = this.targetPos.y;
			this.explode(world);
			this.dead = true;
			return;
		}
		this.pos.x += (dx / remaining) * step;
		this.pos.y += (dy / remaining) * step;
	}

	private explode(world: World): void {
		if (this.splash > 0) {
			world.damageArea(this.pos, this.splash * TILE, this.damage, this.faction);
			world.spawnExplosion(this.pos, this.splash * TILE, true);
		} else {
			// direct hit on the original target if still valid + close
			const t = this.target as Entity;
			if (t && 'hp' in t && !t.dead) {
				const d = dist(t.pos, this.pos);
				if (d <= t.radius + 8) (t as Entity & { takeDamage(n: number): void }).takeDamage(this.damage);
				else world.damageArea(this.pos, 10, this.damage, this.faction);
			}
			world.spawnExplosion(this.pos, 8, false);
		}
	}
}

export interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	maxLife: number;
	size: number;
	color: string;
}

export class Effect {
	pos: Vec2;
	age = 0;
	duration: number;
	particles: Particle[] = [];
	big: boolean;
	dead = false;
	kind: 'explosion' | 'muzzle';

	constructor(kind: 'explosion' | 'muzzle', pos: Vec2, radius: number, big: boolean, rng: () => number) {
		this.kind = kind;
		this.pos = { ...pos };
		this.big = big;
		this.duration = kind === 'muzzle' ? 0.12 : big ? 0.6 : 0.35;
		const count = kind === 'muzzle' ? 5 : big ? 26 : 12;
		for (let i = 0; i < count; i++) {
			const a = rng() * Math.PI * 2;
			const sp = (kind === 'muzzle' ? 60 : big ? 160 : 90) * (0.3 + rng());
			const palette = kind === 'muzzle' ? ['#fff3b0', '#ffd14d', '#ff9d3d'] : ['#fff2c0', '#ffb347', '#ff6a2b', '#9c3b1b', '#444'];
			this.particles.push({
				x: pos.x,
				y: pos.y,
				vx: Math.cos(a) * sp,
				vy: Math.sin(a) * sp,
				life: this.duration * (0.5 + rng() * 0.5),
				maxLife: this.duration,
				size: (kind === 'muzzle' ? 2 : big ? 5 : 3) * (0.6 + rng()),
				color: palette[Math.floor(rng() * palette.length)]!,
			});
		}
		void radius;
	}

	update(dt: number): void {
		this.age += dt;
		for (const p of this.particles) {
			p.life -= dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.vx *= 0.9;
			p.vy *= 0.9;
		}
		if (this.age >= this.duration) this.dead = true;
	}
}
