import { Game } from './core/Game.ts';
import { PixiStage } from './render/pixi/PixiStage.ts';
import type { Difficulty } from './AI.ts';
import { APP_AUTHOR, APP_GITHUB, APP_NAME, APP_OFFICIAL_WEBSITE, APP_ORGANIZATION_WEBSITE, APP_VERSION, APP_YEAR } from './meta.ts';
import { getLocale, initLang, LOCALE_LABELS, setLocale, SUPPORTED_LOCALES, t, type Locale } from './lang/lang.ts';
const canvas = document.getElementById('game') as HTMLCanvasElement;
const menu = document.getElementById('menu') as HTMLDivElement;
const appTitle = document.getElementById('appTitle') as HTMLHeadingElement;
const appVersion = document.getElementById('appVersion') as HTMLDivElement;
const buildInfo = document.getElementById('buildInfo') as HTMLDivElement;
const credits = document.getElementById('credits') as HTMLDivElement;
const websiteLink = document.getElementById('websiteLink') as HTMLAnchorElement;
const githubLink = document.getElementById('githubLink') as HTMLAnchorElement;
const startBtn = document.getElementById('startBtn') as HTMLDivElement;
const difficultyBox = document.getElementById('difficulty') as HTMLDivElement;
const langSwitch = document.getElementById('langSwitch') as HTMLDivElement;
const endScreen = document.getElementById('endScreen') as HTMLDivElement;
const endTitle = document.getElementById('endTitle') as HTMLHeadingElement;
const restartBtn = document.getElementById('restartBtn') as HTMLDivElement;
const pauseScreen = document.getElementById('pauseScreen') as HTMLDivElement;
const resumeBtn = document.getElementById('resumeBtn') as HTMLDivElement;
const restartMissionBtn = document.getElementById('restartMissionBtn') as HTMLDivElement;
const endMissionBtn = document.getElementById('endMissionBtn') as HTMLDivElement;
let game: Game | null = null;
let stage: PixiStage | null = null;
let difficulty: Difficulty = 'medium';
let endResult: 'win' | 'lose' | null = null;

difficultyBox.addEventListener('click', (e: MouseEvent): void => {
	const target = e.target as HTMLElement;
	const diff = target.getAttribute('data-diff') as Difficulty | null;
	if (!diff) return;
	difficulty = diff;
	difficultyBox.querySelectorAll('.btn').forEach((b: Element): void => b.classList.remove('active'));
	target.classList.add('active');
});

// Apply the active locale to every element carrying a `data-lang` key.
function applyDomTranslations(): void {
	document.title = APP_NAME;
	appTitle.textContent = APP_NAME;
	appVersion.textContent = 'v' + APP_VERSION;
	buildInfo.innerHTML = `${t('meta.buildDate')}: ${__BUILD_DATE__}<br />${t('meta.commit')}: ${__COMMIT_ID__}`;
	credits.innerHTML = `<a href="${APP_ORGANIZATION_WEBSITE}" target="_blank" rel="noopener noreferrer">${APP_AUTHOR}</a>, ${APP_YEAR}`;
	websiteLink.href = APP_OFFICIAL_WEBSITE;
	githubLink.href = APP_GITHUB;
	document.querySelectorAll<HTMLElement>('[data-lang]').forEach((el: HTMLElement): void => {
		const key = el.getAttribute('data-lang');
		if (key) el.textContent = t(key);
	});
	if (endResult) endTitle.textContent = t(endResult === 'win' ? 'end.win' : 'end.lose');
}

async function changeLanguage(locale: Locale): Promise<void> {
	await setLocale(locale);
	applyDomTranslations();
	markActiveLanguage();
}

function markActiveLanguage(): void {
	langSwitch.querySelectorAll<HTMLElement>('.btn').forEach((b: HTMLElement): void => {
		b.classList.toggle('active', b.getAttribute('data-lang') === getLocale());
	});
}

function buildLanguageSwitcher(): void {
	for (const locale of SUPPORTED_LOCALES) {
		const btn = document.createElement('div');
		btn.className = 'btn';
		btn.setAttribute('data-lang', locale);
		btn.textContent = LOCALE_LABELS[locale];
		btn.addEventListener('click', (): void => void changeLanguage(locale));
		langSwitch.appendChild(btn);
	}
	markActiveLanguage();
}

function onEnd(result: 'win' | 'lose'): void {
	endResult = result;
	endScreen.style.display = 'flex';
	endScreen.classList.remove('win', 'lose');
	endScreen.classList.add(result);
	endTitle.textContent = t(result === 'win' ? 'end.win' : 'end.lose');
	if (game) game.stop();
}

function returnToMenu(): void {
	if (game) game.stop();
	endScreen.style.display = 'none';
	pauseScreen.style.display = 'none';
	endResult = null;
	menu.style.display = 'flex';
}

function onPauseChange(paused: boolean): void {
	pauseScreen.style.display = paused ? 'flex' : 'none';
}

function startGame(): void {
	if (!stage) return;
	menu.style.display = 'none';
	endScreen.style.display = 'none';
	pauseScreen.style.display = 'none';
	endResult = null;
	if (game) game.stop();
	game = new Game(stage, difficulty, onEnd, returnToMenu, onPauseChange);
	game.hud.layout();
	game.start();
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
resumeBtn.addEventListener('click', (): void => game?.setPaused(false));
restartMissionBtn.addEventListener('click', startGame);
endMissionBtn.addEventListener('click', (): void => game?.quitToMenu());

window.addEventListener('resize', (): void => {
	if (game) {
		game.resize();
		game.hud.layout();
	}
});

// Prevent the page from scrolling / context menu interfering.
window.addEventListener('contextmenu', (e: MouseEvent): void => {
	if (e.target === canvas) e.preventDefault();
});

async function bootstrap(): Promise<void> {
	await initLang();
	buildLanguageSwitcher();
	applyDomTranslations();
	stage = new PixiStage();
	await stage.init(canvas);
}

void bootstrap();
