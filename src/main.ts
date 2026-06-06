import { Game } from './core/Game.ts';
import { PixiStage } from './render/pixi/PixiStage.ts';
import { Screens } from './render/pixi/Screens.ts';
import { preloadTextures } from './render/pixi/textures.ts';
import { unitSpriteUrls, buildingSpriteUrls } from './render/pixi/entitySprites.ts';
import { viewport } from './core/viewport.ts';
import type { Difficulty } from './AI.ts';
import { APP_NAME } from './meta.ts';
import { initLang } from './lang/lang.ts';
const canvas = document.getElementById('game') as HTMLCanvasElement;
let game: Game | null = null;
let stage: PixiStage | null = null;
let screens: Screens | null = null;
let lastDifficulty: Difficulty = 'medium';

function onEnd(result: 'win' | 'lose'): void {
	if (game) game.stop();
	screens?.showEnd(result);
}

function returnToMenu(): void {
	if (game) game.stop();
	game = null;
	screens?.showMenu();
}

function onPauseChange(paused: boolean): void {
	screens?.setPauseVisible(paused);
}

function startGame(difficulty: Difficulty): void {
	if (!stage) return;
	lastDifficulty = difficulty;
	if (game) game.stop();
	screens?.hideAll();
	game = new Game(stage, difficulty, onEnd, returnToMenu, onPauseChange);
	game.hud.layout();
	game.start();
}

window.addEventListener('resize', (): void => {
	viewport.update();
	if (game) {
		game.resize();
		game.hud.layout();
	} else if (stage) stage.resize(viewport.w, viewport.h);
	screens?.resize();
});

// Prevent the page from scrolling / context menu interfering.
window.addEventListener('contextmenu', (e: MouseEvent): void => {
	if (e.target === canvas) e.preventDefault();
});

async function bootstrap(): Promise<void> {
	const title = document.querySelector('.splash .title');
	if (title) title.textContent = APP_NAME;
	const fill = document.querySelector<HTMLElement>('.splash .fill');
	const status = document.querySelector('.splash .status');
	const setProgress = (fraction: number, label?: string): void => {
		if (fill) fill.style.width = `${Math.round(Math.max(0.04, Math.min(1, fraction)) * 100)}%`;
		if (label && status) status.textContent = label;
	};

	setProgress(0.05, 'Loading ...');
	await initLang();
	document.title = APP_NAME;
	viewport.update();
	setProgress(0.15, 'Starting renderer ...');
	stage = new PixiStage();
	await stage.init(canvas);
	setProgress(0.3, 'Loading sprites ...');
	await preloadTextures({ ...unitSpriteUrls(), ...buildingSpriteUrls() }, (f: number): void => setProgress(0.3 + f * 0.65, 'Loading sprites ...'));
	setProgress(1, 'Ready');
	screens = new Screens(stage, {
		onStart: startGame,
		onResume: (): void => game?.setPaused(false),
		onRestartMission: (): void => startGame(lastDifficulty),
		onEndMission: (): void => game?.quitToMenu(),
	});
	screens.showMenu();
	// Re-measure text once the web font has loaded so the layout is accurate.
	void document.fonts.ready.then((): void => screens?.resize());

	// Let the bar visually reach 100% before revealing the menu behind it.
	await barFilled(fill);
	const splash = document.querySelector('.splash');
	if (splash) {
		splash.classList.add('hidden');
		splash.addEventListener('transitionend', (): void => splash.remove(), { once: true });
	}
}

// Resolves once the progress fill finishes its width transition (with a small
// fallback in case the transition is skipped, e.g. width already at target).
function barFilled(fill: HTMLElement | null): Promise<void> {
	if (!fill) return Promise.resolve();
	return new Promise<void>((res: () => void): void => {
		let done = false;
		const finish = (): void => {
			if (done) return;
			done = true;
			res();
		};
		fill.addEventListener('transitionend', finish, { once: true });
		window.setTimeout(finish, 450);
	});
}

void bootstrap();
