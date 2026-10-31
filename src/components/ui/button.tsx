import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, useMotionTemplate, useSpring } from "motion/react";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/90",
				destructive:
					"bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
				outline:
					"border border-border bg-background/60 shadow-xs hover:bg-background dark:border-border dark:bg-input/30 dark:hover:bg-background-popup",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-secondary/80",
				sky: "bg-sky-400 text-foreground hover:bg-sky-400/80",
				zephyr: "bg-zephyr text-foreground text-neutral-50 hover:bg-zephyr/80",
				ghost: "hover:bg-background-surface hover:text-accent-foreground",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2 has-[>svg]:px-3",
				sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
				lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
				icon: "size-9",
				"icon-sm": "size-8",
				"icon-lg": "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

const SPRING = {
	mass: 0.1,
};

type ButtonProps = React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
		glare?: boolean;
	};

function Button({
	className,
	variant,
	size,
	glare,
	children,
	asChild = false,
	...props
}: ButtonProps) {
	const Comp = asChild ? Slot : "button";

	const x = useSpring(0, SPRING);
	const y = useSpring(0, SPRING);
	const opacity = useSpring(0, SPRING);

	const background = useMotionTemplate`
			radial-gradient(
				120px circle at ${x}px ${y}px,
				rgba(255, 255, 255, 0.25),
				transparent 40%
			)
		`;

	const pointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
		if (!glare) return;
		const rect = e.currentTarget.getBoundingClientRect();
		x.set(e.clientX - rect.left);
		y.set(e.clientY - rect.top);
	};

	const pointerEnter = () => {
		if (!glare) return;
		opacity.set(0.35);
	};

	const pointerLeave = () => {
		if (!glare) return;
		opacity.set(0);
	};

	return (
		<Comp
			data-slot="button"
			className={cn(
				"relative overflow-hidden",
				buttonVariants({ variant, size, className }),
			)}
			onPointerMove={pointerMove}
			onPointerEnter={pointerEnter}
			onPointerLeave={pointerLeave}
			{...props}
		>
			{glare && (
				<motion.div
					aria-hidden
					className="pointer-events-none absolute inset-0"
					style={{
						background,
						opacity,
					}}
				/>
			)}

			{children}
		</Comp>
	);
}

export { Button, buttonVariants, type ButtonProps };
