import { Container, FillGradient, Graphics, Text, TextStyle } from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';
import { APP_AUTHOR, APP_GITHUB, APP_NAME, APP_OFFICIAL_WEBSITE, APP_ORGANIZATION_WEBSITE, APP_VERSION, APP_YEAR } from '../../meta.ts';
import { getLocale, LOCALE_LABELS, setLocale, SUPPORTED_LOCALES, t } from '../../lang/lang.ts';
import type { Locale } from '../../lang/lang.ts';
import type { Difficulty } from '../../AI.ts';
import type { PixiStage } from './PixiStage.ts';
import { UIButton } from './UIButton.ts';
import { viewport } from '../../core/viewport.ts';

export interface ScreenCallbacks {
	onStart: (difficulty: Difficulty) => void;
	onResume: () => void;
	onRestartMission: () => void;
	onEndMission: () => void;
}

interface LayoutEntry {
	el: Container;
	w: number;
	h: number;
	gap: number; // vertical gap after this element
}

const FONT = 'Ubuntu, sans-serif';
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/**
 * Full-screen menu / pause / end-game overlays rendered with PixiJS. Replaces
 * the former HTML/DOM overlays so the entire game UI lives in the Pixi scene.
 * Screens are rebuilt on demand (locale change, resize) and rendering is driven
 * on demand via {@link requestRender} when no game loop is running.
 */
export class Screens {
	private readonly menu = new Container();
	private readonly pause = new Container();
	private readonly end = new Container();
	private difficulty: Difficulty = 'medium';
	private endResult: 'win' | 'lose' = 'win';

	constructor(
		private readonly stage: PixiStage,
		private readonly cb: ScreenCallbacks
	) {
		stage.ui.addChild(this.end, this.pause, this.menu);
		this.menu.visible = false;
		this.pause.visible = false;
		this.end.visible = false;
	}

	private get cx(): number {
		return viewport.w / 2;
	}
	private get H(): number {
		return viewport.h;
	}
	private readonly req = (): void => this.stage.render();

	// public control
	showMenu(): void {
		this.buildMenu();
		this.menu.visible = true;
		this.pause.visible = false;
		this.end.visible = false;
		this.req();
	}

	hideAll(): void {
		this.menu.visible = false;
		this.pause.visible = false;
		this.end.visible = false;
		this.req();
	}

	setPauseVisible(v: boolean): void {
		if (v) this.buildPause();
		this.pause.visible = v;
		this.req();
	}

	showEnd(result: 'win' | 'lose'): void {
		this.endResult = result;
		this.buildEnd();
		this.end.visible = true;
		this.req();
	}

	resize(): void {
		if (this.menu.visible) this.buildMenu();
		if (this.pause.visible) this.buildPause();
		if (this.end.visible) this.buildEnd();
		this.req();
	}

	// shared helpers
	private clear(c: Container): void {
		c.removeChildren().forEach((child): void => child.destroy({ children: true }));
	}

	private gradientBg(c: Container, top: string, bottom: string): void {
		const bg = new Graphics();
		const w = viewport.w;
		const h = viewport.h;
		try {
			const grad = new FillGradient(0, 0, 0, h);
			grad.addColorStop(0, top);
			grad.addColorStop(1, bottom);
			bg.rect(0, 0, w, h).fill(grad);
		} catch {
			bg.rect(0, 0, w, h).fill(bottom);
		}
		c.addChild(bg);
	}

	private dimBg(c: Container, alpha: number): void {
		const bg = new Graphics();
		bg.rect(0, 0, viewport.w, viewport.h).fill({ color: '#000000', alpha });
		bg.eventMode = 'static'; // swallow clicks so they don't reach the game canvas
		c.addChild(bg);
	}

	private text(content: string, style: Partial<TextStyleOptions> & { fontSize: number }): Text {
		const tx = new Text({ text: content, style: new TextStyle({ fontFamily: FONT, fill: '#cfe9d2', ...style }) });
		tx.resolution = viewport.textResolution();
		tx.roundPixels = true;
		return tx;
	}

	private link(content: string, url: string, fontSize: number): Text {
		const tx = this.text(content, { fontSize, fill: '#6cff7a', fontWeight: '700' });
		tx.eventMode = 'static';
		tx.cursor = 'pointer';
		tx.on('pointertap', (): void => {
			window.open(url, '_blank', 'noopener,noreferrer');
		});
		tx.on('pointerover', (): void => {
			tx.style.fill = '#ffffff';
			this.req();
		});
		tx.on('pointerout', (): void => {
			tx.style.fill = '#6cff7a';
			this.req();
		});
		return tx;
	}

	// Horizontal row of children, left-to-right, vertically centered.
	private row(children: Container[], gap: number): { el: Container; w: number; h: number } {
		const c = new Container();
		const heights = children.map((ch): number => ch.height);
		const maxH = Math.max(0, ...heights);
		let x = 0;
		children.forEach((ch, i): void => {
			ch.x = x;
			ch.y = (maxH - heights[i]!) / 2;
			c.addChild(ch);
			x += ch.width + gap;
		});
		const w = x - (children.length > 0 ? gap : 0);
		return { el: c, w, h: maxH };
	}

	// Vertically stacks entries, centered horizontally on `cx`, centered as a
	// block vertically within the viewport (offsetY shifts the block).
	private stack(container: Container, entries: LayoutEntry[], offsetY = 0): void {
		let total = 0;
		entries.forEach((e, i): void => {
			total += e.h;
			if (i < entries.length - 1) total += e.gap;
		});
		let y = Math.round((this.H - total) / 2 + offsetY);
		for (const e of entries) {
			e.el.x = Math.round(this.cx - e.w / 2);
			e.el.y = y;
			container.addChild(e.el);
			y += e.h + e.gap;
		}
	}

	// menu
	private buildMenu(): void {
		this.clear(this.menu);
		this.gradientBg(this.menu, '#16321a', '#060a06');
		const title = this.text(APP_NAME, {
			fontSize: 56,
			fontWeight: '800',
			fill: '#6cff7a',
			letterSpacing: 4,
			dropShadow: { color: '#6cff7a', blur: 18, distance: 0, alpha: 0.6, angle: 0 },
		});
		const version = this.text('v' + APP_VERSION, { fontSize: 20, fontWeight: '700', fill: '#cfe9d2', letterSpacing: 2 });
		version.alpha = 0.55;
		const build = this.text(`${t('meta.buildDate')}: ${__BUILD_DATE__}\n${t('meta.commit')}: ${__COMMIT_ID__}`, { fontSize: 14, fill: '#cfe9d2', letterSpacing: 1, align: 'center' });
		build.alpha = 0.5;
		const author = this.link(APP_AUTHOR, APP_ORGANIZATION_WEBSITE, 20);
		const creditsTail = this.text(`, ${APP_YEAR}`, { fontSize: 20, fontWeight: '700', fill: '#cfe9d2' });
		creditsTail.alpha = 0.7;
		const credits = this.row([author, creditsTail], 0);
		const links = this.row([this.link(t('menu.website'), APP_OFFICIAL_WEBSITE, 16), this.link(t('menu.github'), APP_GITHUB, 16)], 20);
		const intro = this.text(t('menu.intro'), { fontSize: 16, fill: '#cfe9d2', align: 'center', wordWrap: true, wordWrapWidth: 540 });
		intro.alpha = 0.85;
		// difficulty selector
		const diffButtons = DIFFICULTIES.map(
			(d): UIButton =>
				new UIButton(
					t(`menu.difficulty.${d}`),
					{ fontSize: 18 },
					(): void => {
						this.difficulty = d;
						for (const b of diffButtons) b.active = false;
						diffButtons[DIFFICULTIES.indexOf(d)]!.active = true;
						this.req();
					},
					this.req
				)
		);
		diffButtons[DIFFICULTIES.indexOf(this.difficulty)]!.active = true;
		const difficulty = this.row(diffButtons, 10);
		const start = new UIButton(t('menu.start'), { fontSize: 18 }, (): void => this.cb.onStart(this.difficulty), this.req);
		// language switcher
		const langButtons = SUPPORTED_LOCALES.map((loc): UIButton => new UIButton(LOCALE_LABELS[loc], { fontSize: 14, height: 34, paddingX: 14 }, (): void => void this.changeLanguage(loc), this.req));
		langButtons[SUPPORTED_LOCALES.indexOf(getLocale())]!.active = true;
		const lang = this.row(langButtons, 8);
		this.stack(this.menu, [
			{ el: title, w: title.width, h: title.height, gap: 4 },
			{ el: version, w: version.width, h: version.height, gap: 2 },
			{ el: build, w: build.width, h: build.height, gap: 8 },
			{ el: credits.el, w: credits.w, h: credits.h, gap: 6 },
			{ el: links.el, w: links.w, h: links.h, gap: 26 },
			{ el: intro, w: intro.width, h: intro.height, gap: 24 },
			{ el: difficulty.el, w: difficulty.w, h: difficulty.h, gap: 18 },
			{ el: start, w: start.boxWidth, h: start.boxHeight, gap: 22 },
			{ el: lang.el, w: lang.w, h: lang.h, gap: 0 },
		]);
	}

	private async changeLanguage(loc: Locale): Promise<void> {
		await setLocale(loc);
		document.title = APP_NAME;
		this.buildMenu();
		this.req();
	}

	// pause
	private buildPause(): void {
		this.clear(this.pause);
		this.dimBg(this.pause, 0.72);
		const title = this.text(t('pause.title'), { fontSize: 30, fontWeight: '700', fill: '#6cff7a', letterSpacing: 4 });
		const resume = new UIButton(t('pause.resume'), { width: 240 }, (): void => this.cb.onResume(), this.req);
		const restart = new UIButton(t('pause.restartMission'), { width: 240 }, (): void => this.cb.onRestartMission(), this.req);
		const endMission = new UIButton(t('pause.endMission'), { width: 240 }, (): void => this.cb.onEndMission(), this.req);
		const entries: LayoutEntry[] = [
			{ el: title, w: title.width, h: title.height, gap: 18 },
			{ el: resume, w: resume.boxWidth, h: resume.boxHeight, gap: 12 },
			{ el: restart, w: restart.boxWidth, h: restart.boxHeight, gap: 12 },
			{ el: endMission, w: endMission.boxWidth, h: endMission.boxHeight, gap: 0 },
		];
		// Panel behind the dialog contents.
		const padX = 48;
		const padY = 36;
		let contentH = 0;
		let contentW = 0;
		entries.forEach((e, i): void => {
			contentH += e.h + (i < entries.length - 1 ? e.gap : 0);
			contentW = Math.max(contentW, e.w);
		});
		const panel = new Graphics();
		const pw = contentW + padX * 2;
		const ph = contentH + padY * 2;
		panel
			.roundRect(this.cx - pw / 2, (this.H - ph) / 2, pw, ph, 10)
			.fill('#16221a')
			.stroke({ width: 1, color: '#2f4a36' });
		this.pause.addChild(panel);
		this.stack(this.pause, entries);
	}

	// end
	private buildEnd(): void {
		this.clear(this.end);
		this.dimBg(this.end, 0.8);
		const win = this.endResult === 'win';
		const title = this.text(t(win ? 'end.win' : 'end.lose'), {
			fontSize: 64,
			fontWeight: '800',
			fill: win ? '#6cff7a' : '#ff5a4d',
			letterSpacing: 6,
			dropShadow: { color: win ? '#6cff7a' : '#ff5a4d', blur: 24, distance: 0, alpha: 0.7, angle: 0 },
		});
		const restart = new UIButton(t('end.restart'), { fontSize: 18 }, (): void => this.cb.onStart(this.difficulty), this.req);
		this.stack(this.end, [
			{ el: title, w: title.width, h: title.height, gap: 20 },
			{ el: restart, w: restart.boxWidth, h: restart.boxHeight, gap: 0 },
		]);
	}
}
