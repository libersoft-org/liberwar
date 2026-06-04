import { Container, Text, TextStyle } from 'pixi.js';
import { viewport } from '../../core/viewport.ts';
export type TextAlign = 'left' | 'center' | 'right';
export type TextBaseline = 'top' | 'middle' | 'alphabetic';
export interface TextOpts {
	size?: number;
	weight?: 'normal' | 'bold';
	family?: string;
	color?: string;
	align?: TextAlign;
	baseline?: TextBaseline;
	alpha?: number;
	stroke?: { color: string; width: number };
}

/**
 * Recyclable pool of PixiJS {@link Text} objects for immediate-mode style HUD
 * rendering. Each frame call {@link begin}, then {@link draw} for every label,
 * then {@link end} to hide any leftovers from the previous frame. This keeps a
 * stable set of Text nodes alive instead of allocating per frame.
 */
export class TextPool {
	private readonly nodes: Text[] = [];
	private index = 0;
	private readonly styleCache = new Map<string, TextStyle>();

	constructor(private readonly layer: Container) {}

	begin(): void {
		this.index = 0;
	}

	draw(content: string, x: number, y: number, opts: TextOpts = {}): void {
		const node = this.nodes[this.index] ?? this.create();
		this.index++;
		node.text = content;
		node.style = this.style(opts);
		node.resolution = viewport.textResolution();
		node.x = x;
		node.y = y;
		node.alpha = opts.alpha ?? 1;
		node.anchor.set(this.anchorX(opts.align), this.anchorY(opts.baseline));
		node.visible = true;
	}

	end(): void {
		for (let i = this.index; i < this.nodes.length; i++) this.nodes[i]!.visible = false;
	}

	private create(): Text {
		const node = new Text({ text: '' });
		node.roundPixels = true;
		this.layer.addChild(node);
		this.nodes.push(node);
		return node;
	}

	private anchorX(align: TextAlign = 'left'): number {
		return align === 'center' ? 0.5 : align === 'right' ? 1 : 0;
	}

	private anchorY(baseline: TextBaseline = 'alphabetic'): number {
		return baseline === 'middle' ? 0.5 : baseline === 'top' ? 0 : 0.8;
	}

	private style(opts: TextOpts): TextStyle {
		const family = opts.family ?? 'Consolas, monospace';
		const size = opts.size ?? 13;
		const weight = opts.weight ?? 'normal';
		const color = opts.color ?? '#ffffff';
		const strokeKey = opts.stroke ? `${opts.stroke.color}:${opts.stroke.width}` : '';
		const key = `${family}|${size}|${weight}|${color}|${strokeKey}`;
		let style = this.styleCache.get(key);
		if (!style) {
			style = new TextStyle({
				fontFamily: family,
				fontSize: size,
				fontWeight: weight,
				fill: color,
				...(opts.stroke ? { stroke: { color: opts.stroke.color, width: opts.stroke.width } } : {}),
			});
			this.styleCache.set(key, style);
		}
		return style;
	}
}
