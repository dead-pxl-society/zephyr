const zephModules = import.meta.glob("../assets/zephs/*.svg", {
	eager: true,
	query: "?url",
	import: "default",
});

const RARE_WEIGHTS: Record<string, number> = {
	"zeph-ded": 0.15,
};

const zephs = Object.entries(zephModules).map(([path, url]) => {
	const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.svg$/, "");

	return { name, url: url as string, weight: RARE_WEIGHTS[name] ?? 1 };
});

export const randomZephUrl = (exclude?: string) => {
	const pool = zephs.filter((zeph) => zeph.url !== exclude);
	const candidates = pool.length > 0 ? pool : zephs;
	const total = candidates.reduce((sum, zeph) => sum + zeph.weight, 0);

	let roll = Math.random() * total;
	for (const zeph of candidates) {
		roll -= zeph.weight;
		if (roll < 0) return zeph.url;
	}

	return candidates[candidates.length - 1].url;
};

export const ZEPH_COLORS = {
	happy: "#FFF180",
	happy2: "#80FFAD",
	hapy2: "#86B4F8",
	dum: "#80DEFF",
	heart: "#FF8080",
	serious: "#9380FF",
	surprised: "#FFCD80",
	ded: "#7993A9",
} as const;

const CELEBRATION_COLORS = Object.entries(ZEPH_COLORS)
	.filter(([name]) => name !== "ded")
	.map(([, color]) => color);

export const randomZephColor = () =>
	CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)];
