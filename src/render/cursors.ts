import { UI } from './pixi/theme.ts';

/**
 * Custom in-game mouse cursors. Each one is drawn once at startup on a small
 * offscreen canvas and embedded as a PNG data URL, so no image assets are
 * needed and the style stays in code (colors come from the UI theme).
 *
 *  - `arrow`   : default game pointer.
 *  - `pointer` : gold arrow for clickable UI (registered as the Pixi 'pointer'
 *                cursor style, used by menu / overlay buttons).
 *  - `select`  : green corner brackets over anything selectable.
 *  - `attack`  : red reticle over attackable enemies.
 */
export type CursorKind = 'arrow' | 'pointer' | 'select' | 'attack';

const OUTLINE = '#10151c';

// Renders `draw` on a fresh canvas and wraps it into a CSS cursor value with
// the given hotspot; `fallback` is the system cursor used if the URL fails.
function make(size: number, hotX: number, hotY: number, fallback: string, draw: (g: CanvasRenderingContext2D) => void): string {
	const c = document.createElement('canvas');
	c.width = size;
	c.height = size;
	const g = c.getContext('2d');
	if (!g) return fallback;
	draw(g);
	return `url(${c.toDataURL('image/png')}) ${hotX} ${hotY}, ${fallback}`;
}

// Dark outline pass under a bright stroke keeps cursors readable on any terrain.
function outlinedStroke(g: CanvasRenderingContext2D, p: Path2D, color: string, width: number): void {
	g.lineCap = 'round';
	g.lineJoin = 'round';
	g.strokeStyle = OUTLINE;
	g.lineWidth = width + 2.5;
	g.stroke(p);
	g.strokeStyle = color;
	g.lineWidth = width;
	g.stroke(p);
}

function arrow(fill: string): string {
	return make(28, 4, 3, 'default', (g: CanvasRenderingContext2D): void => {
		const p = new Path2D();
		p.moveTo(4, 3);
		p.lineTo(4, 24);
		p.lineTo(9.7, 18.5);
		p.lineTo(13.2, 25.6);
		p.lineTo(16.6, 24);
		p.lineTo(13.3, 17.1);
		p.lineTo(21, 17.1);
		p.closePath();
		g.shadowColor = 'rgba(0,0,0,0.45)';
		g.shadowBlur = 2;
		g.shadowOffsetX = 1;
		g.shadowOffsetY = 1;
		g.lineJoin = 'round';
		g.strokeStyle = OUTLINE;
		g.lineWidth = 3;
		g.stroke(p);
		g.shadowColor = 'transparent';
		g.fillStyle = fill;
		g.fill(p);
	});
}

function brackets(color: string): string {
	return make(28, 14, 14, 'pointer', (g: CanvasRenderingContext2D): void => {
		const a = 5; // inset of the corner brackets
		const b = 23;
		const arm = 6.5;
		const p = new Path2D();
		p.moveTo(a, a + arm);
		p.lineTo(a, a);
		p.lineTo(a + arm, a);
		p.moveTo(b - arm, a);
		p.lineTo(b, a);
		p.lineTo(b, a + arm);
		p.moveTo(b, b - arm);
		p.lineTo(b, b);
		p.lineTo(b - arm, b);
		p.moveTo(a + arm, b);
		p.lineTo(a, b);
		p.lineTo(a, b - arm);
		outlinedStroke(g, p, color, 2);
	});
}

function reticle(color: string): string {
	return make(28, 14, 14, 'crosshair', (g: CanvasRenderingContext2D): void => {
		const c = 14;
		const r = 7.5;
		const p = new Path2D();
		p.arc(c, c, r, 0, Math.PI * 2);
		const dirs: [number, number][] = [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		];
		for (const [dx, dy] of dirs) {
			p.moveTo(c + dx * (r - 3.5), c + dy * (r - 3.5));
			p.lineTo(c + dx * (r + 3.5), c + dy * (r + 3.5));
		}
		outlinedStroke(g, p, color, 2);
		g.fillStyle = color;
		g.beginPath();
		g.arc(c, c, 1.8, 0, Math.PI * 2);
		g.fill();
	});
}

export const cursors: Record<CursorKind, string> = {
	arrow: arrow('#e8eef4'),
	pointer: arrow(UI.primary),
	select: brackets(UI.success),
	attack: reticle(UI.danger),
};
