import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { HeroIcon } from "@/components/hero-icon";
import {
	type ContentStatus,
	ShareContent,
} from "@/components/share/share-content";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { hydrateFamilyStore } from "@/lib/store/family";
import type { Parcel } from "@/lib/store/parcels";
import { hydratePeerStore } from "@/lib/store/peers";
import type { PeerInfo } from "@/type";

type ShareSectionProps = {
	parcel: Parcel | null;
	contentStatus: ContentStatus;
	onContentStatusChange: (status: ContentStatus) => void;
	onDone: () => void;
	onPush?: (parcel: Parcel, peer: PeerInfo) => void;
	onCancel?: (endpointId: string) => void;
	onNavBack?: () => void;
};

export const ShareSection = ({
	parcel,
	contentStatus,
	onContentStatusChange,
	onDone,
	onPush,
	onCancel,
	onNavBack,
}: ShareSectionProps) => {
	const { t } = useTranslation(["common", "share"]);

	const handlePush = (peer: PeerInfo) => {
		if (parcel === null || !onPush) return;
		onPush(parcel, peer);
	};

	useEffect(() => {
		hydratePeerStore().catch((e) => console.error("[share] peers", e));
		hydrateFamilyStore().catch((e) => console.error("[share] family", e));
	}, []);

	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex w-full shrink-0 items-center gap-x-4 border-border-inv/5 border-b-[0.5px] p-4 pl-1 dark:border-border">
				<div className="flex flex-1 flex-row items-center">
					<Button
						variant="ghost"
						onClick={onNavBack}
						className="mr-2 h-8 w-8 rounded-full p-0! hover:bg-secondary"
					>
						<HeroIcon name="chevron-left" className="-ml-0.5" />
					</Button>
					<div>
						<DialogTitle className="line-clamp-1">
							{t("share_title", { ns: "share" })}
						</DialogTitle>
						<DialogDescription className="line-clamp-2">
							{t("share_description", {
								count: parcel?.totalFiles || 1,
								ns: "share",
							})}
						</DialogDescription>
					</div>
				</div>
			</div>
			<ShareContent
				parcel={parcel}
				contentStatus={contentStatus}
				onContentStatusChange={onContentStatusChange}
				onPush={handlePush}
				onCancel={onCancel}
				className="min-h-0 flex-1"
				host="dialog"
				animateOnMount={false}
			/>
			<div className="flex h-12 w-full shrink-0 items-center justify-end border-border-inv/5 border-t-[0.5px] p-4 dark:border-border">
				<Button
					onClick={onDone}
					className="h-7 rounded-full py-0 active:scale-[0.96]"
					variant="secondary"
				>
					{t("done")}
				</Button>
			</div>
		</div>
	);
};
