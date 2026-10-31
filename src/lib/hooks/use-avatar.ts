import { glass } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";
import { useMemo } from "react";

const colors = [
	"9380FF",
	"FF8080",
	"FFCD80",
	"80FFAD",
	"80DEFF",
	"FFF180",
	"86B4F8",
	"8AF4EA",
	"9EE699",
	"8DBFF1",

	"0082DB",
	"684DFF",
	"FF4D4D",
	"FFB84D",
	"4DFF8C",
	"4DD1FF",
	"FFEB4D",
	"5696F5",
	"5BF0E1",
	"78DC70",
];

const mix = (a: string, b: string) =>
	`#${[1, 3, 5]
		.map((i) =>
			Math.round(
				(Number.parseInt(a.slice(i, i + 2), 16) +
					Number.parseInt(b.slice(i, i + 2), 16)) /
					2,
			)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;

const build = (seed: string) => {
	if (!seed) return { uri: null, color: null };

	const avatar = createAvatar(glass, {
		seed,
		backgroundColor: colors,
		radius: 50,
		scale: 80,
	});
	const { primaryBackgroundColor, secondaryBackgroundColor, backgroundType } =
		avatar.toJson().extra as Record<string, string>;

	return {
		uri: avatar.toDataUri(),
		color:
			backgroundType === "solid"
				? primaryBackgroundColor
				: mix(primaryBackgroundColor, secondaryBackgroundColor),
	};
};

export const getAvatarColor = (seed: string) => build(seed).color;

const useAvatar = (seed: string) => useMemo(() => build(seed), [seed]);

export default useAvatar;
