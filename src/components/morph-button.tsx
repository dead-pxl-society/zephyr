import { AnimatePresence, motion, type Variants } from "motion/react";
import { Button, type ButtonProps } from "./ui/button";

export type MorphButtonProps = {
	contentKey: string;
} & ButtonProps;

const variants: Variants = {
	initial: { opacity: 0, transform: "scale(0.5)", filter: "blur(4px)" },
	animate: { opacity: 1, transform: "scale(1)", filter: "blur(0px)" },
	exit: { opacity: 0, transform: "scale(0.5)", filter: "blur(4px)" },
};

export const MorphButton = ({
	contentKey,
	children,
	...props
}: MorphButtonProps) => {
	return (
		<Button {...props}>
			<AnimatePresence mode="wait" initial={false}>
				<motion.span
					key={contentKey}
					variants={variants}
					initial="initial"
					animate="animate"
					exit="exit"
					transition={{ duration: 0.1 }}
				>
					{children}
				</motion.span>
			</AnimatePresence>
		</Button>
	);
};
