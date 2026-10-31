import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	codeToKey,
	getModifiers,
	isModifier,
	isModifierCode,
	parseShortcut,
} from "@/lib/shortcuts";
import { useUser } from "@/lib/store/user";

interface UseShortcutPressOptions {
	/** Stop listening without unmounting; the held set clears. */
	enabled?: boolean;
	/** Fires once per press, the moment every key of the combo is down together. */
	onMatch?: () => void;
	/**
	 * Unregister the global shortcuts while listening. A registered hotkey is
	 * swallowed by the OS before the webview sees it, so the keydown never
	 * reaches us unless the shortcut is paused first. Leaves the global
	 * shortcuts working again on cleanup.
	 */
	pauseGlobalShortcuts?: boolean;
}

const sameParts = (a: string[], b: string[]) =>
	a.length === b.length && a.every((part, i) => part === b[i]);

/**
 * Tracks which keys of `shortcut` are physically held right now, so a UI can
 * light them up one by one, and reports when the whole combo lands.
 */
export function useShortcutPress(
	shortcut: string,
	{
		enabled = true,
		onMatch,
		pauseGlobalShortcuts = false,
	}: UseShortcutPressOptions = {},
) {
	const user = useUser();
	const shortcuts = user?.shortcuts;

	const [pressed, setPressed] = useState<string[]>([]);
	/* The one non-modifier key of the combo: unlike the modifiers it has no flag
	   on the event, so we carry it between keydown and keyup ourselves. */
	const keyDownRef = useRef(false);
	const matchedRef = useRef(false);
	const onMatchRef = useRef(onMatch);

	useEffect(() => {
		onMatchRef.current = onMatch;
	}, [onMatch]);

	const parts = useMemo(() => parseShortcut(shortcut), [shortcut]);

	useEffect(() => {
		if (!enabled || !pauseGlobalShortcuts) return;

		invoke("pause_shortcuts").catch(() => undefined);

		return () => {
			invoke("resume_shortcuts", { shortcuts }).catch(() => undefined);
		};
	}, [enabled, pauseGlobalShortcuts, shortcuts]);

	useEffect(() => {
		const reset = () => {
			keyDownRef.current = false;
			matchedRef.current = false;
			setPressed((prev) => (prev.length === 0 ? prev : []));
		};

		if (!enabled || parts.length === 0) {
			reset();
			return;
		}

		const requiredMods = parts.filter(isModifier);
		const requiredKey = parts.find((part) => !isModifier(part));

		const sync = (heldMods: string[]) => {
			const next = parts.filter((part) =>
				isModifier(part) ? heldMods.includes(part) : keyDownRef.current,
			);

			setPressed((prev) => (sameParts(prev, next) ? prev : next));

			const matched = next.length === parts.length;
			if (matched && !matchedRef.current) onMatchRef.current?.();
			matchedRef.current = matched;
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isModifierCode(e.code) && codeToKey(e.code) === requiredKey) {
				keyDownRef.current = true;
			}
			sync(getModifiers(e));
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			const heldMods = getModifiers(e);

			/* macOS drops the keyup for regular keys while Command is held, so the
			   combo breaking counts as the key coming back up. */
			if (
				codeToKey(e.code) === requiredKey ||
				!requiredMods.every((mod) => heldMods.includes(mod))
			) {
				keyDownRef.current = false;
			}

			sync(heldMods);
		};

		window.addEventListener("keydown", handleKeyDown, true);
		window.addEventListener("keyup", handleKeyUp, true);
		/* Losing focus means we stop hearing keyups: assume nothing is held. */
		window.addEventListener("blur", reset);

		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
			window.removeEventListener("keyup", handleKeyUp, true);
			window.removeEventListener("blur", reset);
			reset();
		};
	}, [enabled, parts]);

	return {
		pressed,
		matched: pressed.length > 0 && pressed.length === parts.length,
	};
}

export type { UseShortcutPressOptions };
