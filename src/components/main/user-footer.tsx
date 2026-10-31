import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DicebearAvatar } from "@/components/dicebear-avatar";
import { HeroIcon } from "@/components/hero-icon";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUpdaterStore } from "@/lib/store/updater";
import type { User } from "@/type";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type UserFooterProps = {
	user: User | null;
};

export const UserFooter = ({ user }: UserFooterProps) => {
	const { t } = useTranslation("navigation");

	const navigate = useNavigate();

	const navToSettings = () => navigate("/settings");

	const [mdnsEnabled, setMdnsEnabled] = useState(true);

	const updateStatus = useUpdaterStore((s) => s.status);
	const updateVersion = useUpdaterStore((s) => s.version);
	const downloaded = useUpdaterStore((s) => s.downloaded);
	const total = useUpdaterStore((s) => s.total);
	const downloadAndInstall = useUpdaterStore((s) => s.downloadAndInstall);

	const updatePending =
		updateStatus === "available" ||
		updateStatus === "downloading" ||
		updateStatus === "installing";

	const updateBusy =
		updateStatus === "downloading" || updateStatus === "installing";

	const downloadPercent =
		total && total > 0
			? Math.min(100, Math.round((downloaded / total) * 100))
			: null;

	const copyEndpointTicket = async () => {
		try {
			const ticket = await invoke<string>("endpoint_ticket");
			await writeText(ticket || "");
			toast.success(t("common:ticket_copied"));
		} catch {
			toast.error(t("errors:ticket_copy"));
		}
	};

	const toggleMdns = async () => {
		const next = !mdnsEnabled;
		setMdnsEnabled(next);
		try {
			await invoke(next ? "enable_mdns_cmd" : "disable_mdns_cmd");
		} catch (e) {
			setMdnsEnabled(!next);
			console.log(JSON.stringify(e));
		}
	};

	useEffect(() => {
		invoke<boolean>("mdns_enabled_cmd").then(setMdnsEnabled);
	}, []);

	return (
		<TooltipProvider delayDuration={1000} skipDelayDuration={500}>
			<DropdownMenu>
				<DropdownMenuTrigger className="group">
					<div className="absolute bottom-0 w-full px-1">
						<div className="flex w-full flex-row items-center rounded-full p-1 group-hover:bg-background-popup group-data-[state=open]:bg-background-popup windows:dark:group-data-[state=open]:bg-neutral-800 windows:dark:group-hover:bg-neutral-800">
							<div className="flex flex-1 flex-row items-center gap-x-1">
								<DicebearAvatar
									seed={user?.endpointId}
									className="h-10 w-10 transition-transform [transition-timing-function:var(--ease-out-cubic)] group-hover:scale-80 group-data-[state=open]:scale-80"
								/>
								<div className="relative flex flex-col">
									<Tooltip>
										<TooltipTrigger asChild>
											<p className="absolute max-w-[128px] translate-x-1 truncate text-sm transition-transform [transition-timing-function:var(--ease-out-cubic)] group-hover:-translate-x-0 group-hover:-translate-y-2 group-hover:text-xs group-data-[state=open]:-translate-x-0 group-data-[state=open]:-translate-y-2 group-data-[state=open]:text-xs">
												{user?.name}
											</p>
										</TooltipTrigger>
										<TooltipContent>
											<p>{user?.name}</p>
										</TooltipContent>
									</Tooltip>
									<p className="translate-y-2 text-muted text-sm opacity-0 transition-opacity [transition-timing-function:var(--ease-out-cubic)] group-hover:text-xs group-hover:opacity-100 group-data-[state=open]:text-xs group-data-[state=open]:opacity-100">
										{t(
											mdnsEnabled
												? "discovery:discoverable"
												: "discovery:contacts_only",
										)}
									</p>
								</div>
							</div>
							<div className="hidden shrink-0 items-center opacity-0 transition-opacity [transition-timing-function:var(--ease-out-cubic)] group-hover:flex group-hover:opacity-100 group-data-[state=open]:flex group-data-[state=open]:opacity-100">
								<div className="flex h-8 w-8 items-center justify-center rounded-2xl p-0 dark:group-data-[state=open]:bg-foreground/10 dark:hover:bg-foreground/10">
									<HeroIcon
										name="ellipsis-vertical"
										className="h-4 w-4"
										iconStyle="solid"
									/>
								</div>
							</div>
						</div>
					</div>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="ml-2 w-[208px] windows:dark:bg-neutral-800">
					<DropdownMenuLabel className="text-xs">
						{t("common:device")}
					</DropdownMenuLabel>
					<DropdownMenuItem
						className="text-xs hover:bg-black/10! dark:hover:bg-foreground/10!"
						onClick={navToSettings}
					>
						<HeroIcon
							name="cog-6-tooth"
							className="h-4 w-4 text-foreground"
							iconStyle="micro"
						/>{" "}
						{t("settings")}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="text-xs hover:bg-black/10! dark:hover:bg-foreground/10!"
						onClick={copyEndpointTicket}
					>
						<HeroIcon
							name="ticket"
							className="h-4 w-4 text-foreground"
							iconStyle="micro"
						/>
						{t("peers:action_copy_endpoint_ticket")}
					</DropdownMenuItem>
					{updatePending && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="text-xs">
								{t("updater:update_available")}
							</DropdownMenuLabel>
							<DropdownMenuItem
								className="text-xs hover:bg-black/10! dark:hover:bg-foreground/10!"
								disabled={updateBusy}
								onSelect={() => downloadAndInstall()}
							>
								<HeroIcon
									name="arrow-down-tray"
									className="h-4 w-4 text-foreground"
									iconStyle="micro"
								/>
								{updateStatus === "installing"
									? t("updater:action_installing")
									: updateStatus === "downloading"
										? downloadPercent === null
											? t("updater:action_downloading")
											: t("updater:action_downloading_percent", {
													percent: downloadPercent,
												})
										: t("updater:action_update_now", {
												version: updateVersion,
											})}
							</DropdownMenuItem>
						</>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuLabel className="text-xs">Discovery</DropdownMenuLabel>
					<DropdownMenuItem
						className="text-xs hover:bg-black/10! dark:hover:bg-foreground/10!"
						onSelect={(e) => {
							e.preventDefault();
							toggleMdns();
						}}
					>
						<HeroIcon
							name={mdnsEnabled ? "signal-slash" : "signal"}
							className="h-4 w-4 text-foreground"
						/>
						{t(
							mdnsEnabled
								? "discovery:action_disable_mdns"
								: "discovery:action_enable_mdns",
						)}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</TooltipProvider>
	);
};
