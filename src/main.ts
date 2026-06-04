import { Game } from './core/Game.ts';
import { PixiStage } from './render/pixi/PixiStage.ts';
import { Screens } from './render/pixi/Screens.ts';
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
	await initLang();
	document.title = APP_NAME;
	viewport.update();
	stage = new PixiStage();
	await stage.init(canvas);
	screens = new Screens(stage, {
		onStart: startGame,
		onResume: (): void => game?.setPaused(false),
		onRestartMission: (): void => startGame(lastDifficulty),
		onEndMission: (): void => game?.quitToMenu(),
	});
	screens.showMenu();
	// Re-measure text once the web font has loaded so the layout is accurate.
	void document.fonts.ready.then((): void => screens?.resize());
}

void bootstrap();
