// Internationalization: locale detection, loading and string lookup.
// Supported locales for now: English (fallback) and Czech.

export type Locale = 'en' | 'cs';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'cs'];

// Human-readable short labels for the language switcher.
export const LOCALE_LABELS: Record<Locale, string> = {
	en: 'EN',
	cs: 'CZ',
};

const DEFAULT_LOCALE: Locale = 'en';
const STORAGE_KEY = 'rts.lang';

type Dict = { [key: string]: string | Dict };

const loaders: Record<Locale, () => Promise<{ default: Dict }>> = {
	en: (): Promise<{ default: Dict }> => import('./locales/en.json'),
	cs: (): Promise<{ default: Dict }> => import('./locales/cs.json'),
};

let current: Locale = DEFAULT_LOCALE;
let dict: Dict = {};

function isLocale(value: string): value is Locale {
	return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

// Resolve the active locale: stored choice -> browser language -> fallback.
export function detectLocale(): Locale {
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored && isLocale(stored)) return stored;
	const base = (navigator.language ?? '').toLowerCase().split('-')[0]!;
	return isLocale(base) ? base : DEFAULT_LOCALE;
}

export function getLocale(): Locale {
	return current;
}

async function applyLocale(locale: Locale, persist: boolean): Promise<void> {
	const mod = await loaders[locale]();
	dict = mod.default;
	current = locale;
	if (persist) localStorage.setItem(STORAGE_KEY, locale);
}

// Load the detected locale once at startup (does not persist the detection).
export async function initLang(): Promise<void> {
	await applyLocale(detectLocale(), false);
}

// Switch to a locale chosen by the user and remember it in localStorage.
export async function setLocale(locale: Locale): Promise<void> {
	await applyLocale(locale, true);
}

// Look up a dotted key (e.g. `building.refinery`) in the nested dictionary.
function lookup(key: string): string | undefined {
	let node: string | Dict | undefined = dict;
	for (const part of key.split('.')) {
		if (typeof node !== 'object' || node === null) return undefined;
		node = node[part];
	}
	return typeof node === 'string' ? node : undefined;
}

// Translate a key, interpolating `{name}`-style placeholders from `params`.
export function t(key: string, params?: Record<string, string | number>): string {
	let value = lookup(key) ?? key;
	if (params) {
		for (const name in params) value = value.replace(`{${name}}`, String(params[name]));
	}
	return value;
}
