import type { ComponentType, SVGProps } from "react";

type ShapeProps = SVGProps<SVGSVGElement>;

const Shape = ({ children, ...props }: ShapeProps) => (
	<svg
		viewBox="0 0 16 16"
		fill="currentColor"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
		shapeRendering="crispEdges"
		{...props}
	>
		{children}
	</svg>
);

const Ball = (props: ShapeProps) => (
	<Shape {...props}>
		<rect x="6" y="4" width="4" height="1" />
		<rect x="5" y="5" width="6" height="1" />
		<rect x="4" y="6" width="8" height="4" />
		<rect x="5" y="10" width="6" height="1" />
		<rect x="6" y="11" width="4" height="1" />
	</Shape>
);

const Ring = (props: ShapeProps) => (
	<Shape {...props}>
		<rect x="6" y="4" width="4" height="1" />
		<rect x="5" y="5" width="6" height="1" />
		<rect x="4" y="6" width="2" height="4" />
		<rect x="10" y="6" width="2" height="4" />
		<rect x="5" y="10" width="6" height="1" />
		<rect x="6" y="11" width="4" height="1" />
	</Shape>
);

const Sparkle = (props: ShapeProps) => (
	<Shape {...props}>
		<rect x="7" y="1" width="2" height="2" />
		<rect x="6" y="3" width="4" height="2" />
		<rect x="5" y="5" width="6" height="2" />
		<rect x="1" y="7" width="14" height="2" />
		<rect x="5" y="9" width="6" height="2" />
		<rect x="6" y="11" width="4" height="2" />
		<rect x="7" y="13" width="2" height="2" />
	</Shape>
);

const Diamond = (props: ShapeProps) => (
	<Shape {...props}>
		<rect x="7" y="2" width="2" height="1" />
		<rect x="6" y="3" width="4" height="1" />
		<rect x="5" y="4" width="6" height="1" />
		<rect x="4" y="5" width="8" height="1" />
		<rect x="3" y="6" width="10" height="1" />
		<rect x="2" y="7" width="12" height="2" />
		<rect x="3" y="9" width="10" height="1" />
		<rect x="4" y="10" width="8" height="1" />
		<rect x="5" y="11" width="6" height="1" />
		<rect x="6" y="12" width="4" height="1" />
		<rect x="7" y="13" width="2" height="1" />
	</Shape>
);

const Block = (props: ShapeProps) => (
	<Shape {...props}>
		<rect x="4" y="4" width="8" height="8" />
	</Shape>
);

const Plus = (props: ShapeProps) => (
	<Shape {...props}>
		<rect x="6" y="2" width="4" height="12" />
		<rect x="2" y="6" width="12" height="4" />
	</Shape>
);

const Heart = (props: ShapeProps) => (
	<Shape {...props}>
		<rect x="3" y="3" width="3" height="1" />
		<rect x="10" y="3" width="3" height="1" />
		<rect x="2" y="4" width="5" height="1" />
		<rect x="9" y="4" width="5" height="1" />
		<rect x="2" y="5" width="12" height="2" />
		<rect x="3" y="7" width="10" height="1" />
		<rect x="4" y="8" width="8" height="1" />
		<rect x="5" y="9" width="6" height="1" />
		<rect x="6" y="10" width="4" height="1" />
		<rect x="7" y="11" width="2" height="1" />
	</Shape>
);

const Strip = (props: ShapeProps) => (
	<Shape {...props}>
		<rect x="6" y="2" width="4" height="12" />
	</Shape>
);

export const CONFETTI_SHAPES: {
	Component: ComponentType<ShapeProps>;
	weight: number;
}[] = [
	{ Component: Ball, weight: 3 },
	{ Component: Block, weight: 2.5 },
	{ Component: Strip, weight: 2.5 },
	{ Component: Diamond, weight: 2 },
	{ Component: Ring, weight: 1.5 },
	{ Component: Sparkle, weight: 1.5 },
	{ Component: Plus, weight: 1 },
	{ Component: Heart, weight: 1 },
];

const TOTAL_WEIGHT = CONFETTI_SHAPES.reduce(
	(sum, shape) => sum + shape.weight,
	0,
);

export const randomConfettiShape = () => {
	let roll = Math.random() * TOTAL_WEIGHT;
	for (const shape of CONFETTI_SHAPES) {
		roll -= shape.weight;
		if (roll < 0) return shape.Component;
	}

	return CONFETTI_SHAPES[CONFETTI_SHAPES.length - 1].Component;
};
