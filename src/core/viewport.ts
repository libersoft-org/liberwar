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
export const REFERENCE_HEIGHT = 1080;

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
};

viewport.update();
