import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { KeyboardKey } from "@/components/onboarding/keyboard-key";
import { OptionGlyph } from "@/components/onboarding/option-glyph";
import { useShortcutPress } from "@/lib/hooks/use-shortcut-press";
import {
	displayKey,
	isMac,
	isModifier,
	type Modifier,
	parseShortcut,
} from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/* Mac keycaps carry the symbol up top and the word underneath; PC caps just
   print the word, which displayKey already gives us. */
const MODIFIER_GLYPH: Record<Modifier, ReactNode> = {
	Ctrl: "⌃",
	Alt: <OptionGlyph />,
	Shift: "⇧",
	Super: "⌘",
};

const MODIFIER_LABEL: Record<Modifier, string> = {
	Ctrl: "control",
	Alt: "option",
	Shift: "shift",
	Super: "command",
};

/* The reward beat. Each cap blooms green and springs up in the same instant,
   and the caps fire one after another — the light and the release are one
   event, the way a switch actuates as it lets go. */
const RIPPLE = 55;
const HOP = 520;
/* Sit on the settled green caps before the step exits. */
const DWELL = 260;
/* How long the tint alone takes, for the reduced-motion path. */
const TINT = 160;

const capContent = (part: string, labels: boolean) => {
	if (!isModifier(part)) return { glyph: displayKey(part) };
	if (!isMac) return { label: displayKey(part) };

	return {
		glyph: MODIFIER_GLYPH[part],
		label: labels ? MODIFIER_LABEL[part] : undefined,
	};
};

interface ShortcutKeycapsProps {
	/** Stored shortcut, e.g. "Ctrl+Super+Z". */
	shortcut?: string | null;
	/** Width of a single cap in px; the row scales with it. */
	size?: number;
	/** Listen for the combo being pressed. */
	listen?: boolean;
	/** Hold every cap down and tint it green, to sit on a correct press. */
	confirmed?: boolean;
	/** Fires once the confirm sequence has finished playing. */
	onConfirmedEnd?: () => void;
	/** Print the modifier name under the symbol — unreadable below ~56px caps. */
	labels?: boolean;
	/** See useShortcutPress: needed wherever this combo is a live global hotkey. */
	pauseGlobalShortcuts?: boolean;
	onMatch?: () => void;
	className?: string;
}

/**
 * The keys of a shortcut as physical caps, lighting up as they are held down.
 * `onMatch` fires when the whole combo is pressed.
 */
export const ShortcutKeycaps = ({
	shortcut,
	size = 72,
	listen = true,
	confirmed = false,
	onConfirmedEnd,
	labels = true,
	pauseGlobalShortcuts = false,
	onMatch,
	className,
}: ShortcutKeycapsProps) => {
	const parts = parseShortcut(shortcut);
	const { pressed } = useShortcutPress(shortcut ?? "", {
		enabled: listen,
		onMatch,
		pauseGlobalShortcuts,
	});

	const reduced = useReducedMotion();
	const onConfirmedEndRef = useRef(onConfirmedEnd);

	useEffect(() => {
		onConfirmedEndRef.current = onConfirmedEnd;
	}, [onConfirmedEnd]);

	useEffect(() => {
		if (!confirmed) return;

		const lastCap = reduced ? 0 : (parts.length - 1) * RIPPLE;
		/* Don't make a reduced-motion user wait out a hop that never plays. */
		const done = setTimeout(
			() => onConfirmedEndRef.current?.(),
			reduced ? TINT + DWELL : lastCap + HOP + DWELL,
		);

		return () => clearTimeout(done);
	}, [confirmed, parts.length, reduced]);

	if (parts.length === 0) return null;

	return (
		<div
			className={cn("flex items-center", className)}
			style={{ gap: (size * 12) / 110 }}
		>
			{parts.map((part, index) => {
				/* Live press feedback stays instant; only the reward ripples. */
				const ripple = confirmed && !reduced ? index * RIPPLE : 0;

				return (
					<motion.div
						key={part}
						/* Full transform string rather than the `y` shorthand: the
						   shorthand composes on the main thread, which is already busy
						   painting the DotGrid canvas behind this step. */
						animate={
							confirmed && !reduced
								? {
										transform: [
											"translateY(0px)",
											"translateY(-7px)",
											"translateY(0px)",
										],
									}
								: { transform: "translateY(0px)" }
						}
						transition={{
							duration: HOP / 1000,
							delay: ripple / 1000,
							times: [0, 0.3, 1],
							ease: [
								[0.16, 1, 0.3, 1],
								[0.34, 1.3, 0.64, 1],
							],
						}}
					>
						<KeyboardKey
							size={size}
							pressed={confirmed ? false : pressed.includes(part)}
							variant={confirmed ? "success" : "default"}
							delay={ripple}
							{...capContent(part, labels)}
						/>
					</motion.div>
				);
			})}
		</div>
	);
};

export type { ShortcutKeycapsProps };
