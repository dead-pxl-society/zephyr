import i18n from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";

export const DEFAULT_LANG = "en";

export const SUPPORTED_LANGUAGES = [
	{ code: "en", label: "🇺🇸 English" },
	{ code: "es", label: "🇲🇽 Español" },
	{ code: "de", label: "🇩🇪 Deutsch" },
	{ code: "fr", label: "🇫🇷 Français" },
	{ code: "it", label: "🇮🇹 Italiano" },
	{ code: "pt", label: "🇧🇷 Português" },
	{ code: "ru", label: "🇷🇺 Русский" },
	{ code: "ja", label: "🇯🇵 日本語" },
	{ code: "ko", label: "🇰🇷 한국어" },
	{ code: "zh", label: "🇨🇳 简体中文" },
] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map(
	(l) => l.code,
) as readonly string[];

export function resolveLocale(locale?: string | null): AppLanguage {
	const candidate =
		!locale || locale === "system" ? navigator.language : locale;
	const lang = candidate.split("-")[0].toLowerCase();

	return LANGUAGE_CODES.includes(lang) ? (lang as AppLanguage) : DEFAULT_LANG;
}

export const NAMESPACES = [
	"common",
	"settings",
	"transfers",
	"parcels",
	"peers",
	"errors",
	"share",
	"navigation",
	"notifications",
	"sounds",
	"discovery",
	"onboarding",
	"updater",
] as const;

export type Namespace = (typeof NAMESPACES)[number];

let initialized = false;

export async function initI18n(locale?: string) {
	if (initialized) return i18n;

	initialized = true;

	await i18n
		.use(
			resourcesToBackend(
				(language: string, namespace: string) =>
					import(`./locales/${language}/${namespace}.json`),
			),
		)
		.use(initReactI18next)
		.init({
			lng: resolveLocale(locale),
			fallbackLng: DEFAULT_LANG,
			supportedLngs: LANGUAGE_CODES,
			load: "currentOnly",

			ns: NAMESPACES,
			defaultNS: "common",

			interpolation: {
				escapeValue: false,
			},
			react: {
				useSuspense: true,
			},
		});

	return i18n;
}

export async function changeLanguage(locale?: string | null) {
	await i18n.changeLanguage(resolveLocale(locale));
}

export default i18n;
