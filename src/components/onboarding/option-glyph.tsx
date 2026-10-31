import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/* Sized in em so it rides the font-size of whatever key it sits in. */
export const OptionGlyph = ({
	className,
	...props
}: SVGProps<SVGSVGElement>) => (
	<svg
		viewBox="0 0 24 21"
		fill="currentColor"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
		className={cn("h-[0.875em] w-[1em]", className)}
		{...props}
	>
		<path d="M7.371.76H2.16q-.502 0-.844.327a1.07 1.07 0 0 0-.341.802q0 .488.341.815.342.327.844.328h4.655q.278 0 .48.125a.9.9 0 0 1 .328.39l6.996 15.777q.334.753.865 1.094t1.324.342h5.24q.488 0 .836-.335.35-.335.349-.794a1.08 1.08 0 0 0-.349-.808 1.17 1.17 0 0 0-.836-.335h-4.641q-.613 0-.864-.516L9.573 2.195a2.35 2.35 0 0 0-.878-1.052A2.36 2.36 0 0 0 7.371.76m14.676 0h-6.76a1.16 1.16 0 0 0-.836.32 1.06 1.06 0 0 0-.334.795q0 .487.334.808.335.32.836.32h6.76q.501 0 .836-.32t.335-.808q0-.474-.335-.795a1.16 1.16 0 0 0-.836-.32" />
	</svg>
);
