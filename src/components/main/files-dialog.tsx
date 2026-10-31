import { exists } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
	type ForwardedRef,
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useMiddleEllipsis } from "@/lib/hooks/use-middle-ellipsis";
import type { ParcelFile } from "@/lib/store/parcels";
import { cn } from "@/lib/utils";
import { mimeFromPath, mimeToFileIcon } from "@/lib/utils/file-icon";
import { basename } from "@/lib/utils/path";
import { HeroIcon } from "../hero-icon";
import { LucideIcon } from "../lucide-icon";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";

export interface FilesDialogHandle {
	present: () => void;
	dismiss: () => void;
}

type FilesDialogProps = {
	title: string;
	description?: string;
	parcelFiles?: ParcelFile[];
	paths?: string[];
};

type FileItemProps = {
	path: string;
	mime?: string;
	fileExists?: boolean | null;
};

const FileItem = ({ path, mime, fileExists }: FileItemProps) => {
	const { t } = useTranslation("errors");
	const resolvedMime = mime || mimeFromPath(path);
	const iconName = mimeToFileIcon(resolvedMime);
	const isFolder = resolvedMime === "folder";

	const label = basename(path);

	const displayText = useMiddleEllipsis({
		text: label,
		maxWidth: 384,
		font: "400 14px Geist, ui-sans-serif, system-ui, sans-serif",
	});

	const handleClick = useCallback(async () => {
		if (fileExists) {
			try {
				await revealItemInDir(path);
			} catch {
				toast.error(t("file_open_error"));
			}
		} else {
			toast.warning(t("file_no_longer_available"));
		}
	}, [isFolder, fileExists, path, t]);

	const hoverIconName = fileExists === false ? "square-x" : "external-link";
	const isInteractive = fileExists !== null;

	return (
		<li key={path}>
			<button
				type="button"
				onClick={handleClick}
				disabled={!isInteractive}
				className={cn(
					"group flex w-full flex-row items-center gap-2 text-start",
					fileExists === false && "opacity-50",
				)}
			>
				<span className="relative h-4 w-4 shrink-0">
					<LucideIcon
						className="h-4 w-4 opacity-80 transition-[opacity,transform] duration-[200ms] [transition-timing-function:var(--ease-out-quart)] group-hover:scale-85 group-hover:opacity-0"
						name={iconName}
					/>
					<LucideIcon
						className="absolute inset-0 h-4 w-4 scale-85 opacity-0 transition-[opacity,transform] duration-[200ms] [transition-timing-function:var(--ease-out-quart)] group-hover:scale-100 group-hover:opacity-80"
						name={hoverIconName}
					/>
				</span>
				<span
					className={`${
						isFolder ? "line-clamp-1" : "w-[24rem]"
					} ${fileExists ? "decoration-dashed underline-offset-2 group-hover:underline" : ""}`}
				>
					{displayText}
				</span>
			</button>
		</li>
	);
};

export const FilesDialog = forwardRef(
	(
		{ title, description, paths, parcelFiles }: FilesDialogProps,
		ref: ForwardedRef<FilesDialogHandle>,
	) => {
		const [open, setOpen] = useState(false);
		const [existsMap, setExistsMap] = useState<Record<string, boolean>>({});

		const present = () => setOpen(true);
		const dismiss = () => setOpen(false);

		const files = useMemo(() => {
			return (
				parcelFiles?.slice().sort((a, b) => {
					if (a.mime === "folder" && b.mime !== "folder") return -1;
					if (a.mime !== "folder" && b.mime === "folder") return 1;
					return 0;
				}) || []
			);
		}, [parcelFiles]);

		const allPaths = useMemo(() => {
			const filePaths = files.map((f) => f.path);
			const extraPaths = paths ?? [];
			return [...filePaths, ...extraPaths];
		}, [files, paths]);

		useEffect(() => {
			if (!open || allPaths.length === 0) {
				setExistsMap({});
				return;
			}

			let cancelled = false;

			Promise.allSettled(
				allPaths.map(async (p) => {
					const result = await exists(p);
					return [p, result] as const;
				}),
			).then((results) => {
				if (cancelled) return;
				const map: Record<string, boolean> = {};
				for (let i = 0; i < results.length; i++) {
					const r = results[i];
					map[allPaths[i]] = r.status === "fulfilled" ? r.value[1] : false;
				}
				setExistsMap(map);
			});

			return () => {
				cancelled = true;
			};
		}, [open, allPaths]);

		useImperativeHandle(ref, () => ({ present, dismiss }));

		return (
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent
					className="top-[calc(-0.01px+8vh)] left-[calc(50%+112px)] flex w-[28rem] translate-y-0 flex-col gap-0 rounded-xl border-border bg-background-top p-0"
					showCloseButton={false}
				>
					<DialogHeader className="p-4">
						<DialogTitle>{title}</DialogTitle>
						{description && (
							<DialogDescription>{description}</DialogDescription>
						)}
					</DialogHeader>
					<div className="h-[0.5px] bg-border-inv/10" />
					<ul className="max-h-96 space-y-2 overflow-scroll p-4">
						{paths &&
							paths.length > 0 &&
							paths.map((path) => (
								<FileItem
									key={path}
									path={path}
									fileExists={existsMap[path] ?? null}
								/>
							))}
						{files.length > 0 &&
							files.map((file) => (
								<FileItem
									key={file.path}
									path={file.path}
									mime={file.mime !== "unknown" ? file.mime : undefined}
									fileExists={existsMap[file.path] ?? null}
								/>
							))}
					</ul>
					<div className="absolute top-4 right-4">
						<Button
							variant="ghost"
							onClick={dismiss}
							glare
							className="touch-hitbox edge-highlight h-10 w-10 rounded-full bg-transparent backdrop-blur-lg hover:bg-transparent active:scale-[0.96]"
						>
							<HeroIcon name="close" className="h-5! w-5!" />
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		);
	},
);
