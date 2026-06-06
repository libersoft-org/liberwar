import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { UI } from './theme.ts';
import { viewport } from '../../core/viewport.ts';
export interface ButtonOpts {
	width?: number; // fixed width; otherwise sized from the label
	height?: number; // default 44
	fontSize?: number; // default 18
	paddingX?: number; // horizontal padding when auto-sizing, default 28
}

/**
 * Interactive PixiJS button: a rounded panel with a centered label and hover /
 * active highlight states, mirroring the look of the former DOM `.btn`.
 */
export class UIButton extends Container {
	private readonly bg = new Graphics();
	private readonly txt: Text;
	private _w = 0;
	private _h: number;
	private hovered = false;
	private _active = false;
	private readonly fontSize: number;
	private readonly fixedWidth: number | undefined;
	private readonly paddingX: number;

	constructor(text: string, opts: ButtonOpts, onClick: () => void, requestRender: () => void) {
		super();
		this.fontSize = opts.fontSize ?? 18;
		this.fixedWidth = opts.width;
		this.paddingX = opts.paddingX ?? 28;
		this._h = opts.height ?? 44;
		this.txt = new Text({ text, style: this.makeStyle() });
		this.txt.resolution = viewport.textResolution();
		this.txt.roundPixels = true;
		this.txt.anchor.set(0.5);
		this.addChild(this.bg, this.txt);
		this.eventMode = 'static';
		this.cursor = 'pointer';
		this.on('pointerover', (): void => {
			this.hovered = true;
			this.redraw();
			requestRender();
		});
		this.on('pointerout', (): void => {
			this.hovered = false;
			this.redraw();
			requestRender();
		});
		this.on('pointertap', (): void => onClick());
		this.setText(text);
	}

	get boxWidth(): number {
		return this._w;
	}
	get boxHeight(): number {
		return this._h;
	}

	get active(): boolean {
		return this._active;
	}
	set active(v: boolean) {
		if (this._active === v) return;
		this._active = v;
		this.redraw();
	}

	setText(text: string): void {
		this.txt.text = text;
		this._w = this.fixedWidth ?? Math.ceil(this.txt.width + this.paddingX * 2);
		this.redraw();
	}

	private makeStyle(): TextStyle {
		return new TextStyle({ fontFamily: 'Ubuntu, sans-serif', fontSize: this.fontSize, fill: UI.text, fontWeight: '500' });
	}

	private redraw(): void {
		const hot = this._active || this.hovered;
		this.bg
			.clear()
			.roundRect(0, 0, this._w, this._h, 6)
			.fill(hot ? UI.primary : UI.surface)
			.stroke({ width: 1, color: UI.primary });
		this.txt.style.fill = hot ? UI.background : UI.text;
		this.txt.x = this._w / 2;
		this.txt.y = this._h / 2;
	}
}
