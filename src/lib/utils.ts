import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function humanReadableSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let i = -1;
	do {
		bytes = bytes / 1024;
		i++;
	} while (bytes >= 1024 && i < units.length - 1);
	return `${bytes.toFixed(1)} ${units[i]}`;
}
