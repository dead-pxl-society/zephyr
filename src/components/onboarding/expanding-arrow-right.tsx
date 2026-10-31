export const ExpandingArrowRight = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.5"
		strokeLinecap="round"
		strokeLinejoin="round"
		className="size-4 overflow-visible"
	>
		<title>Arrow right</title>
		<line
			x1="2.75"
			y1="8"
			x2="10"
			y2="8"
			className="origin-left transition-transform duration-200 ease-out [transform-box:fill-box] group-hover:scale-x-150"
		/>
		<polyline
			points="8,5 11,8 8,11"
			className="transition-transform duration-200 ease-out [transform-box:fill-box] group-hover:translate-x-[3.6px]"
		/>
	</svg>
);
