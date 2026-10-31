import { motion } from "motion/react";

export function FolderCogIcon({
	spinning = false,
	size = 24,
	title = "cogfolder",
}: {
	spinning?: boolean;
	size?: number;
	title?: string;
}) {
	const titleId = `${title.replace(/\s+/g, "-")}-icon`;

	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
			aria-labelledby={titleId}
		>
			<title id={titleId}>{title}</title>

			<path d="M10.3 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.98a2 2 0 0 1 1.69.9l.66 1.2A2 2 0 0 0 12 6h8a2 2 0 0 1 2 2v3.3" />

			<motion.g
				animate={
					spinning
						? { transform: ["rotate(0deg)", "rotate(360deg)"] }
						: { transform: "rotate(0deg)" }
				}
				transition={{
					repeat: spinning ? Infinity : 0,
					duration: 0.85,
					ease: "linear",
				}}
				style={{
					transformOrigin: "18px 18px",
				}}
			>
				<path d="m14.305 19.53.923-.382" />
				<path d="m15.228 16.852-.923-.383" />
				<path d="m16.852 15.228-.383-.923" />
				<path d="m16.852 20.772-.383.924" />
				<path d="m19.148 15.228.383-.923" />
				<path d="m19.53 21.696-.382-.924" />
				<path d="m20.772 16.852.924-.383" />
				<path d="m20.772 19.148.924.383" />
				<circle cx="18" cy="18" r="3" />
			</motion.g>
		</svg>
	);
}
