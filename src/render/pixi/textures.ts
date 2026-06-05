import { Assets, Texture } from 'pixi.js';
import type { Faction } from '../../core/types.ts';

// Preloaded sprite textures keyed by a logical name. Loaded once during
// bootstrap so entity views can grab them synchronously while building.

const SPRITE_URLS: Record<string, string> = {
	'harvester-player': 'sprites/units/harvester-blue.webp',
	'harvester-enemy': 'sprites/units/harvester-red.webp',
	'lighttank-player': 'sprites/units/tank-light-blue.webp',
	'lighttank-enemy': 'sprites/units/tank-light-red.webp',
	'heavytank-player': 'sprites/units/tank-heavy-blue.webp',
	'heavytank-enemy': 'sprites/units/tank-heavy-red.webp',
};

const cache = new Map<string, Texture>();

function resolve(path: string): string {
	return import.meta.env.BASE_URL + path;
}

export async function preloadTextures(): Promise<void> {
	const entries = Object.entries(SPRITE_URLS) as [string, string][];
	await Promise.all(
		entries.map(async ([key, url]: [string, string]): Promise<void> => {
			cache.set(key, await Assets.load(resolve(url)));
		})
	);
}

export function harvesterTexture(faction: Faction): Texture {
	return cache.get(`harvester-${faction}`) ?? Texture.EMPTY;
}

export function lightTankTexture(faction: Faction): Texture {
	return cache.get(`lighttank-${faction}`) ?? Texture.EMPTY;
}

export function heavyTankTexture(faction: Faction): Texture {
	return cache.get(`heavytank-${faction}`) ?? Texture.EMPTY;
}
