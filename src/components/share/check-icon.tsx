import { motion, type Variants } from "motion/react";

type CheckIconProps = {
	strokeColor: string;
};

const draw: Variants = {
	hidden: { pathLength: 0, opacity: 0 },
	visible: {
		pathLength: 1,
		opacity: 1,
		transition: { duration: 0.16, delay: 0.04 },
	},
};

export const CheckIcon = ({ strokeColor }: CheckIconProps) => (
	<motion.svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke={strokeColor}
		strokeWidth={2}
		className="size-6"
		initial="hidden"
		animate="visible"
	>
		<title>Check</title>
		<motion.path
			variants={draw}
			strokeLinecap="round"
			strokeLinejoin="round"
			d="M4.5 12.75l6 6 9-13.5"
		/>
	</motion.svg>
);
