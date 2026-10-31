import { exists } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { dirname } from "@/lib/utils/path";

export interface RevealResult {
	revealed: number;
	missing: number;
	total: number;
}

async function tryReveal(file: string): Promise<"revealed" | "missing"> {
	try {
		const fileExists = await exists(file);
		if (!fileExists) return "missing";
		await revealItemInDir(file);
		return "revealed";
	} catch {
		try {
			await revealItemInDir(file);
			return "revealed";
		} catch {
			return "missing";
		}
	}
}

export async function revealTransferFiles(
	files: string[],
): Promise<RevealResult> {
	const result: RevealResult = { revealed: 0, missing: 0, total: files.length };

	const byDir = new Map<string, string[]>();
	for (const file of files) {
		const dir = dirname(file);
		const group = byDir.get(dir) ?? [];
		group.push(file);
		byDir.set(dir, group);
	}

	for (const [, group] of byDir) {
		for (const file of group) {
			const status = await tryReveal(file);
			if (status === "revealed") {
				result.revealed += 1;
				break;
			}
			result.missing += 1;
		}
	}

	return result;
}
