import type { ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const docIconUrls = Object.fromEntries(
	Object.entries(
		import.meta.glob("../assets/icons/doc*.svg", {
			eager: true,
			query: "?url",
			import: "default",
		}),
	).map(([path, url]) => [
		path
			.slice(path.lastIndexOf("/doc") + "/doc".length)
			.replace(/^-/, "")
			.replace(/\.svg$/, ""),
		url as string,
	]),
) as Record<DocIconName, string>;

export type DocIconName =
	| ""
	| "audio"
	| "app"
	| "archive"
	| "book"
	| "font"
	| "image"
	| "odf"
	| "odf-p"
	| "odf-s"
	| "ppt"
	| "sheet"
	| "text"
	| "video"
	| "word"
	| "pdf";

export type DocIconProps = {
	name?: DocIconName;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src">;

export function mimeToDocIcon(mime?: string): DocIconName {
	if (!mime) return "";

	if (mime.startsWith("audio/")) return "audio";
	if (mime.startsWith("video/")) return "video";
	if (mime.startsWith("image/")) return "image";
	if (mime.startsWith("text/")) return "text";

	if (
		mime === "application/msword" ||
		mime ===
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	)
		return "word";

	if (
		mime === "application/vnd.ms-excel" ||
		mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	)
		return "sheet";

	if (
		mime === "application/vnd.ms-powerpoint" ||
		mime ===
			"application/vnd.openxmlformats-officedocument.presentationml.presentation"
	)
		return "ppt";

	if (mime === "application/vnd.oasis.opendocument.text") return "odf";

	if (mime === "application/vnd.oasis.opendocument.spreadsheet") return "odf-s";

	if (mime === "application/vnd.oasis.opendocument.presentation")
		return "odf-p";

	if (mime === "application/epub+zip") return "book";

	if (mime === "application/pdf") return "pdf";

	if (
		mime === "application/zip" ||
		mime === "application/x-tar" ||
		mime === "application/x-7z-compressed" ||
		mime === "application/vnd.rar"
	)
		return "archive";

	if (
		mime.startsWith("font/") ||
		mime === "application/font-woff" ||
		mime === "application/font-woff2"
	)
		return "font";

	if (
		mime === "application/x-msdownload" ||
		mime === "application/x-executable" ||
		mime === "application/vnd.android.package-archive"
	)
		return "app";

	return "";
}

export const DocIcon = ({
	name = "",
	className,
	...imgProps
}: DocIconProps) => (
	<img
		{...imgProps}
		src={docIconUrls[name] ?? docIconUrls[""]}
		alt={name}
		className={cn("", className)}
	/>
);
