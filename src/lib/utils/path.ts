const TRAILING_SEPARATORS = /[/\\]+$/;

export function hasTrailingSeparator(path: string): boolean {
	return TRAILING_SEPARATORS.test(path);
}

export function basename(path: string): string {
	const trimmed = path.replace(TRAILING_SEPARATORS, "");
	if (!trimmed) return path;

	const lastSeparator = Math.max(
		trimmed.lastIndexOf("/"),
		trimmed.lastIndexOf("\\"),
	);

	return lastSeparator === -1 ? trimmed : trimmed.slice(lastSeparator + 1);
}

export function dirname(path: string): string {
	const trimmed = path.replace(TRAILING_SEPARATORS, "");
	const lastSeparator = Math.max(
		trimmed.lastIndexOf("/"),
		trimmed.lastIndexOf("\\"),
	);

	return lastSeparator > 0 ? trimmed.slice(0, lastSeparator) : path;
}
