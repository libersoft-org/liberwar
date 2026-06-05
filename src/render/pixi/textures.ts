import { Assets, Texture } from 'pixi.js';
// Generic preloaded-texture cache keyed by a logical name. Loaded once during
// bootstrap (see main.ts) so views can grab textures synchronously while
// building. Callers that own the asset descriptions (e.g. SPRITE_UNITS in
// entitySprites.ts) supply the key -> url map.
const cache = new Map<string, Texture>();

function resolve(path: string): string {
	return import.meta.env.BASE_URL + path;
}

export async function preloadTextures(urls: Record<string, string>): Promise<void> {
	const entries = Object.entries(urls);
	await Promise.all(
		entries.map(async ([key, url]: [string, string]): Promise<void> => {
			cache.set(key, await Assets.load(resolve(url)));
		})
	);
}

export function texture(key: string): Texture {
	return cache.get(key) ?? Texture.EMPTY;
}
