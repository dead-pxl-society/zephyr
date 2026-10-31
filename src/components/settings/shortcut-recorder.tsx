import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
	buildShortcut,
	codeToKey,
	displayKey,
	getModifiers,
	isModifierCode,
	MODIFIER_ORDER,
} from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

interface ShortcutRecorderProps {
	value: string;
	onChange: (shortcut: string) => void;
	className?: string;
}

function ShortcutRecorder({
	value,
	onChange,
	className,
}: ShortcutRecorderProps) {
	const { t } = useTranslation("common");
	const [recording, setRecording] = useState(false);
	const [heldModifiers, setHeldModifiers] = useState<string[]>([]);
	const containerRef = useRef<HTMLButtonElement>(null);

	const stopRecording = useCallback(async () => {
		setRecording(false);
		setHeldModifiers([]);
		try {
			await invoke("resume_shortcuts");
		} catch {
			// best-effort restore
		}
	}, []);

	const startRecording = useCallback(async () => {
		try {
			await invoke("pause_shortcuts");
		} catch {
			// best-effort pause
		}
		setRecording(true);
		setHeldModifiers([]);
	}, []);

	const handleClick = useCallback(() => {
		if (!recording) startRecording();
	}, [recording, startRecording]);

	const handleBlur = useCallback(() => {
		if (recording) stopRecording();
	}, [recording, stopRecording]);

	useEffect(() => {
		if (!recording) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();

			if (e.code === "Escape") {
				stopRecording();
				return;
			}

			const modifiers = getModifiers(e);
			setHeldModifiers(modifiers);

			if (!isModifierCode(e.code)) {
				const key = codeToKey(e.code);
				if (key && modifiers.length > 0) {
					const shortcut = buildShortcut(modifiers, key);
					stopRecording();
					onChange(shortcut);
				}
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setHeldModifiers(getModifiers(e));
		};

		window.addEventListener("keydown", handleKeyDown, true);
		window.addEventListener("keyup", handleKeyUp, true);
		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
			window.removeEventListener("keyup", handleKeyUp, true);
		};
	}, [recording, onChange, stopRecording]);

	const parts = value ? value.split("+") : [];
	const showHeldModifiers = recording && heldModifiers.length > 0;

	return (
		<button
			ref={containerRef}
			type="button"
			onClick={handleClick}
			onBlur={handleBlur}
			className={cn(
				"inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 outline-none transition-all",
				recording
					? "bg-background-top ring-[2px] ring-ring/50"
					: "hover:bg-background-top hover:shadow-sm",
				className,
			)}
		>
			{recording ? (
				showHeldModifiers ? (
					<KbdGroup>
						{MODIFIER_ORDER.filter((m) => heldModifiers.includes(m)).map(
							(mod) => (
								<Kbd key={mod}>{displayKey(mod)}</Kbd>
							),
						)}
					</KbdGroup>
				) : (
					<span className="text-muted text-xs">
						{t("shortcut_recording_prompt")}
					</span>
				)
			) : parts.length > 0 ? (
				<KbdGroup>
					{parts.map((part) => (
						<Kbd key={part}>{displayKey(part)}</Kbd>
					))}
				</KbdGroup>
			) : (
				<span className="text-muted text-xs">{t("not_set")}</span>
			)}
		</button>
	);
}

export { ShortcutRecorder, type ShortcutRecorderProps };
