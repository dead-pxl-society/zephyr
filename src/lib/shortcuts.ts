import { platform } from "@tauri-apps/plugin-os";

/**
 * Shortcuts are stored as "Ctrl+Alt+Shift+Super+Key" — modifiers first, always
 * in MODIFIER_ORDER, so a combo has one canonical string whatever order the
 * user pressed it in. This mirrors what tauri-plugin-global-shortcut expects.
 */
export const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Super"] as const;

export type Modifier = (typeof MODIFIER_ORDER)[number];

export const isMac = platform() === "macos";

const DISPLAY_MAP: Record<string, string> = isMac
	? {
			Ctrl: "⌃",
			Super: "⌘",
			Alt: "⌥",
			Shift: "⇧",
			Up: "↑",
			Down: "↓",
			Left: "←",
			Right: "→",
		}
	: {
			Ctrl: "Ctrl",
			Super: "Win",
			Alt: "Alt",
			Shift: "Shift",
			Up: "↑",
			Down: "↓",
			Left: "←",
			Right: "→",
		};

const STATIC_CODE_MAP: Record<string, string> = {
	Space: "Space",
	Enter: "Enter",
	Backspace: "Backspace",
	Tab: "Tab",
	Delete: "Delete",
	Home: "Home",
	End: "End",
	PageUp: "PageUp",
	PageDown: "PageDown",
	Minus: "-",
	Equal: "=",
	BracketLeft: "[",
	BracketRight: "]",
	Backslash: "\\",
	Semicolon: ";",
	Quote: "'",
	Comma: ",",
	Period: ".",
	Slash: "/",
	Backquote: "`",
};

const MODIFIER_CODES = [
	"ControlLeft",
	"ControlRight",
	"AltLeft",
	"AltRight",
	"ShiftLeft",
	"ShiftRight",
	"MetaLeft",
	"MetaRight",
];

/** How a stored key reads on this platform: "Super" is ⌘ on mac, "Win" elsewhere. */
export function displayKey(key: string): string {
	return DISPLAY_MAP[key] ?? key;
}

export function parseShortcut(shortcut?: string | null): string[] {
	return shortcut ? shortcut.split("+") : [];
}

export function buildShortcut(modifiers: string[], key: string): string {
	const orderedMods = MODIFIER_ORDER.filter((m) => modifiers.includes(m));
	return [...orderedMods, key].join("+");
}

export function isModifier(part: string): part is Modifier {
	return (MODIFIER_ORDER as readonly string[]).includes(part);
}

export function isModifierCode(code: string): boolean {
	return MODIFIER_CODES.includes(code);
}

/** KeyboardEvent.code -> the stored key name, or null if we don't bind it. */
export function codeToKey(code: string): string | null {
	if (code.startsWith("Key")) return code.slice(3);
	if (code.startsWith("Digit")) return code.slice(5);
	if (code.startsWith("Arrow")) return code.slice(5);
	if (code.startsWith("F") && /^F\d{1,2}$/.test(code)) return code;

	return STATIC_CODE_MAP[code] ?? null;
}

/** Read from the event flags, so it stays right even if we missed a keyup. */
export function getModifiers(e: KeyboardEvent): Modifier[] {
	const mods: Modifier[] = [];
	if (e.ctrlKey) mods.push("Ctrl");
	if (e.altKey) mods.push("Alt");
	if (e.shiftKey) mods.push("Shift");
	if (e.metaKey) mods.push("Super");
	return mods;
}
