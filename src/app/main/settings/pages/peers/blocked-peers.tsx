import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DicebearAvatar } from "@/components/dicebear-avatar";
import { Section, SectionTitle } from "@/components/settings/section";
import { Button } from "@/components/ui/button";
import type { Peer } from "@/type";

const fetchBlockedPeers = async () => {
	const blocked: Peer[] = await invoke("get_peers", {
		pagination: { trust_level: "blocked" },
	});

	return blocked;
};

export const BlockedPeersPage = () => {
	const { t } = useTranslation("peers");

	const { data: blockedPeers, refetch } = useQuery({
		queryKey: ["peers", "blocked"],
		queryFn: fetchBlockedPeers,
	});

	const unblockPeer = (endpointId: string) => async () => {
		try {
			await invoke("unblock_peer", { endpointId });
			refetch();
		} catch {
			toast.error(t("errors:unblocking_peer"));
		}
	};

	return (
		<div className="flex h-full w-full justify-center">
			<Section>
				<SectionTitle>{t("blocked_devices")}</SectionTitle>
				<div className="space-y-4">
					{(!blockedPeers || blockedPeers.length < 1) && (
						<p className="text-muted">{t("peers:blocked_devices_empty")}</p>
					)}
					{blockedPeers?.map((peer) => (
						<div key={peer.endpointId} className="flex">
							<div className="flex flex-1 items-center gap-2">
								<DicebearAvatar className="h-6 w-6" seed={peer.endpointId} />
								<p className="line-clamp-1">
									{peer.name ||
										t("peers:peer_default_name", {
											id: peer.endpointId.slice(-4),
										})}
								</p>
							</div>
							<div className="shrink-0">
								<Button
									variant="ghost"
									className="h-8 rounded-2xl hover:bg-border/80 active:scale-[0.97] dark:hover:bg-white/10"
									onClick={unblockPeer(peer.endpointId)}
								>
									{t("peers:action_unblock")}
								</Button>
							</div>
						</div>
					))}
				</div>
			</Section>
		</div>
	);
};
