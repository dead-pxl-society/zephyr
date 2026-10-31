import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext";
import { useMemo } from "react";

type Options = {
	text: string;
	maxWidth: number;
	font?: string;
	leftWeight?: number;
	rightWeight?: number;
};

export const useMiddleEllipsis = ({
	text,
	maxWidth,
	font = "14px Geist",
	leftWeight = 0.5,
	rightWeight = 0.5,
}: Options) => {
	return useMemo(() => {
		if (!text) return "";

		const ellipsis = "…";
		const bufferedWidth = maxWidth - 48;

		const measure = (str: string) => {
			const prepared = prepareWithSegments(str, font);

			const { lines } = layoutWithLines(prepared, Number.MAX_SAFE_INTEGER, 26);

			return lines?.[0]?.width ?? 0;
		};

		if (measure(text) <= bufferedWidth) return text;

		let low = 0;
		let high = text.length;

		let best = ellipsis;

		while (low <= high) {
			const mid = Math.floor((low + high) / 2);

			const leftCount = Math.ceil(mid * leftWeight);
			const rightCount = Math.floor(mid * rightWeight);

			const leftPart = text.slice(0, leftCount);
			const rightPart = text.slice(text.length - rightCount);

			const candidate = leftPart + ellipsis + rightPart;

			if (measure(candidate) <= bufferedWidth) {
				best = candidate;
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}

		return best;
	}, [text, maxWidth, font, leftWeight, rightWeight]);
};
