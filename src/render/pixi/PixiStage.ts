import { Application, Container, Graphics } from 'pixi.js';
import { viewport } from '../../core/viewport.ts';

/**
 * Owns the PixiJS {@link Application} and the top-level container hierarchy.
 *
 * Layering (back to front):
 *  - `world`   : camera-offset game scene (terrain, entities, fog). Masked to
 *                the left viewport so nothing renders under the sidebar.
 *  - `screen`  : screen-space world overlays (selection box, placement preview).
 *  - `hud`     : the right-hand sidebar.
 *  - `toast`   : top-right notifications.
 *  - `ui`      : full-screen menu / pause / end-game overlays (front-most).
 *
 * Created once and reused across matches; {@link reset} clears the scene so a
 * new {@link Game} can repopulate it. The `ui` layer is intentionally not
 * cleared by {@link reset} so the menu/pause/end screens persist between matches.
 */
export class PixiStage {
	readonly app = new Application();
	readonly world = new Container();
	readonly screen = new Container();
	readonly hud = new Container();
	readonly toast = new Container();
	readonly ui = new Container();
	private readonly worldMask = new Graphics();
	private initialized = false;

	async init(canvas: HTMLCanvasElement): Promise<void> {
		if (this.initialized) return;
		await this.app.init({
			canvas,
			width: window.innerWidth,
			height: window.innerHeight,
			background: '#05080a',
			antialias: true,
			resolution: Math.min(window.devicePixelRatio || 1, 2),
			autoDensity: true,
			preference: 'webgl',
		});
		this.app.stage.addChild(this.world, this.screen, this.hud, this.toast, this.ui);
		this.app.stage.addChild(this.worldMask);
		this.app.stage.scale.set(viewport.scale);
		this.world.mask = this.worldMask;
		// We drive rendering manually from the Game loop.
		this.app.ticker.stop();
		this.initialized = true;
	}

	get canvas(): HTMLCanvasElement {
		return this.app.canvas;
	}

	resize(viewW: number, viewH: number): void {
		this.app.renderer.resize(window.innerWidth, window.innerHeight);
		this.app.stage.scale.set(viewport.scale);
		this.worldMask.clear().rect(0, 0, viewW, viewH).fill('#ffffff');
	}

	// Detaches every child of the scene containers so a fresh match can rebuild
	// them. Display objects are destroyed to free GPU resources.
	reset(): void {
		for (const c of [this.world, this.screen, this.hud, this.toast]) {
			c.removeChildren().forEach((child): void => child.destroy({ children: true }));
		}
	}

	render(): void {
		this.app.renderer.render(this.app.stage);
	}
}
