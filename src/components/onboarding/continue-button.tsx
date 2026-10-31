import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ContinueButtonProps = Omit<ButtonProps, "variant" | "size">;

/**
 * The pill shaped action that moves the onboarding forward. It rests on a solid
 * edge and sinks into it when pressed: snappy on the way down, a little
 * overshoot on the way back up.
 */
export const ContinueButton = ({
	className,
	...props
}: ContinueButtonProps) => (
	<Button
		variant="zephyr"
		size="lg"
		className={cn(
			"group select-none rounded-full px-8 text-neutral-50 hover:bg-zephyr",
			"[--zephyr-edge:color-mix(in_oklab,var(--zephyr)_62%,black)]",
			"shadow-[0_4px_0_0_var(--zephyr-edge)]",
			// release: slower, with a little overshoot so it pops back up
			"transition-[translate,box-shadow] duration-200 ease-[cubic-bezier(0.34,1.4,0.64,1)]",
			// press: near instant, no overshoot
			"active:translate-y-1 active:shadow-[0_0_0_0_var(--zephyr-edge)] active:duration-75 active:ease-out",
			className,
		)}
		{...props}
	/>
);
