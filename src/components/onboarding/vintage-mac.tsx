import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/** Full color icon; only its size is themeable. */
export const VintageMac = ({
	className,
	...props
}: SVGProps<SVGSVGElement>) => (
	<svg
		viewBox="0 0 32 32"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
		className={cn("size-8", className)}
		{...props}
	>
		<path
			d="M6 2L4 3.5V26.5L5 28H5.5L7 29.5L8 31H23.5L25 30L26.5 28L28 27V4L27 2.5H26.5L25.5 1H6.5L6 2Z"
			fill="#EBE3DD"
		/>
		<path
			d="M8 19L7.5 18H6.5V6L8 4H23.5L25 5H25.5V16L24 19H8Z"
			fill="#0A0A0A"
		/>
		<path d="M28.9499 3.0498H27.4299V27.4298H28.9499V3.0498Z" fill="#000001" />
		<path
			d="M27.4301 1.51953H25.9001V3.04953H27.4301V1.51953Z"
			fill="#000001"
		/>
		<path
			d="M4.57007 27.4297V28.9497H6.09007V30.4797H7.62007V28.9497H24.3801V30.4797H25.9001V28.9497H27.4301V27.4297H4.57007Z"
			fill="#000001"
		/>
		<path
			d="M25.9001 4.57031H24.3801V18.2903H25.9001V4.57031Z"
			fill="#000001"
		/>
		<path
			d="M24.3801 30.4805H7.62012V32.0005H24.3801V30.4805Z"
			fill="#000001"
		/>
		<path d="M24.38 22.8604H18.28V24.3804H24.38V22.8604Z" fill="#000001" />
		<path d="M24.3801 18.29H7.62012V19.81H24.3801V18.29Z" fill="#000001" />
		<path d="M24.3801 3.0498H7.62012V4.5698H24.3801V3.0498Z" fill="#000001" />
		<path
			d="M9.14012 22.8604H7.62012V24.3804H9.14012V22.8604Z"
			fill="#000001"
		/>
		<path d="M25.9001 0H6.09009V1.52H25.9001V0Z" fill="#000001" />
		<path
			d="M7.62009 4.57031H6.09009V18.2903H7.62009V4.57031Z"
			fill="#000001"
		/>
		<path
			d="M6.09007 1.51953H4.57007V3.04953H6.09007V1.51953Z"
			fill="#000001"
		/>
		<path d="M4.57005 3.0498H3.05005V27.4298H4.57005V3.0498Z" fill="#000001" />
	</svg>
);
