/**
 * Resolution-independent viewport based on a fixed *reference height*.
 *
 * The game is authored against {@link REFERENCE_HEIGHT} logical pixels tall.
 * On any real screen the whole scene is uniformly scaled by
 * `scale = window.innerHeight / REFERENCE_HEIGHT`, so an object always occupies
 * the same fraction of the screen height regardless of the device resolution.
 *
 * The width is *not* constrained: the logical width grows/shrinks with the
 * window's aspect ratio (`w = window.innerWidth / scale`), so wider screens
 * simply reveal more of the world horizontally — there are no letterbox bars.
 *
 * Every module that needs sizes should read {@link viewport}`.w` / `.h`
 * (logical pixels) and apply {@link viewport}`.scale` only when converting to or
 * from physical/window pixels (e.g. mouse input).
 */
const REFERENCE_HEIGHT = 1080;

export const viewport = {
	/** Logical width (window width expressed in reference pixels). */
	w: 0,
	/** Logical height — always {@link REFERENCE_HEIGHT}. */
	h: REFERENCE_HEIGHT,
	/** Physical pixels per logical pixel (`innerHeight / REFERENCE_HEIGHT`). */
	scale: 1,

	/** Recompute the logical size and scale from the current window. */
	update(): void {
		this.scale = window.innerHeight / REFERENCE_HEIGHT;
		this.h = REFERENCE_HEIGHT;
		this.w = window.innerWidth / this.scale;
	},

	/**
	 * Resolution (texture pixel density) that {@link import('pixi.js').Text}
	 * objects should use so they stay crisp under the scaled stage.
	 *
	 * The on-screen device-pixel density of a glyph is `scale * dpr`. Rendering
	 * the texture at exactly that density maps 1:1 but small fonts then look soft
	 * when the stage is shrunk (`scale < 1`). Instead we super-sample: rasterise
	 * at *at least* the native device density (`dpr`) and more when the stage is
	 * enlarged, so the glyph texture is down-sampled onto the screen — markedly
	 * sharper for small text. Capped to keep texture memory bounded.
	 */
	textResolution(): number {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		return Math.min(4, dpr * Math.max(1, this.scale));
	},
};

viewport.update();
