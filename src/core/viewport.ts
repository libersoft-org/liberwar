/**
 * Fixed-aspect-ratio viewport.
 *
 * The whole game (menu, HUD and the match itself) renders into a logical area
 * whose size is derived from the window height: the height always fills the
 * viewport and the width is `height * ASPECT`. The resulting rectangle is
 * centered horizontally, so narrower windows get pillarbox bars on the sides.
 *
 * Every module that previously read `window.innerWidth` / `window.innerHeight`
 * should read {@link viewport}`.w` / `.h` instead so the fixed ratio is honoured
 * consistently.
 */
export const ASPECT = 16 / 9;

export const viewport = {
	/** Logical width of the rendered area (CSS pixels). */
	w: 0,
	/** Logical height of the rendered area (CSS pixels). */
	h: 0,
	/** Horizontal offset of the rendered area inside the window (pillarbox). */
	left: 0,
	/** Vertical offset of the rendered area inside the window. */
	top: 0,

	/** Recompute the logical size from the current window dimensions. */
	update(): void {
		const h = window.innerHeight;
		const w = Math.round(h * ASPECT);
		this.w = w;
		this.h = h;
		this.left = Math.round((window.innerWidth - w) / 2);
		this.top = 0;
	},
};

viewport.update();
