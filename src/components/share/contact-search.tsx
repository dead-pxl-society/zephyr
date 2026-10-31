import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
	AnimatePresence,
	MotionConfig,
	motion,
	type Transition,
} from "motion/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebounce } from "use-debounce";
import { cn } from "@/lib/utils";
import type { Peer } from "@/type";
import { HeroIcon } from "../hero-icon";
import { DataTable } from "../main/table";
import { SimpleEmpty } from "../simple-empty";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { createShareContactColumns } from "./share-contact-columns";

const SEARCH_LIMIT = 20;

const swapVariants = {
	initial: { opacity: 0, transform: "translateY(-12px)" },
	animate: { opacity: 1, transform: "translateY(0px)" },
	exit: { opacity: 0, transform: "translateY(12px)" },
};

type ContactSearchProps = {
	parcelId?: number;
	loadedContacts: Peer[];
	onBack?: () => void;
	onContactClick?: (peer: Peer) => void;
};

export const searchTransition: Transition = {
	type: "spring",
	duration: 0.3,
	bounce: 0.125,
};

export const dialogSurface =
	"group-data-[host=dialog]/picker:bg-background dark:group-data-[host=dialog]/picker:bg-background";

export const ContactSearch = ({
	parcelId,
	loadedContacts,
	onBack,
	onContactClick,
}: ContactSearchProps) => {
	const [query, setQuery] = useState("");
	const [search] = useDebounce(query.trim(), 250);

	const { t } = useTranslation(["peers"]);

	const { data: results = [], isLoading } = useQuery({
		queryKey: ["contacts", "search", search],
		queryFn: () =>
			invoke<Peer[]>("get_peers", {
				pagination: { limit: SEARCH_LIMIT, kind: "contact", search },
			}),
		enabled: search.length > 0,
		placeholderData: keepPreviousData,
	});

	const contactColumns = useMemo(
		() => createShareContactColumns(parcelId),
		[parcelId],
	);

	const data = search ? results : loadedContacts;
	const isEmpty = Boolean(search) && data.length === 0 && !isLoading;
	const dataKey = data.map((peer) => peer.endpointId).join();

	return (
		<MotionConfig transition={searchTransition}>
			<div className="space-y-4 p-4">
				<div className="flex items-center gap-x-2">
					<motion.div
						className="h-10 w-10"
						initial={{
							opacity: 0,
							transform: "scale(0.75)",
							filter: "blur(8px)",
						}}
						animate={{ opacity: 1, transform: "scale(1)", filter: "blur(0)" }}
					>
						<Button
							variant="ghost"
							className={cn(
								"touch-hitbox edge-highlight h-full w-full rounded-full bg-background-popup/40 hover:bg-background-popup/40 active:scale-[0.97]",
								dialogSurface,
							)}
							glare
							onClick={onBack}
						>
							<HeroIcon name="chevron-left" className="h-6 w-6" />
						</Button>
					</motion.div>
					<motion.label
						htmlFor="contact-search-input"
						layoutId="search-bar"
						className={cn(
							"group edge-highlight flex h-10 w-full cursor-text items-center gap-x-2 rounded-full bg-background-popup/20 px-4 transition-colors focus-within:bg-background-popup/40",
							dialogSurface,
						)}
					>
						<motion.span
							layoutId="search-icon"
							className="opacity-60 transition-opacity group-focus-within:opacity-100"
						>
							{isLoading ? (
								<Spinner className="h-4 w-4" />
							) : (
								<HeroIcon
									name="magnifying-glass"
									className="h-4 w-4"
									iconStyle="micro"
								/>
							)}
						</motion.span>
						<div className="relative flex-1">
							<Input
								id="contact-search-input"
								autoFocus
								aria-label={t("peers:search_contacts")}
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								className="h-auto border-0 bg-transparent px-0 py-0 shadow-none dark:bg-transparent"
							/>
							{!query && (
								<motion.span
									layoutId="search-label"
									className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-muted text-sm"
								>
									{t("peers:search_contacts")}
								</motion.span>
							)}
						</div>
					</motion.label>
				</div>
				<motion.div
					layout="position"
					layoutId="share-contacts-table"
					className="relative"
				>
					<AnimatePresence mode="popLayout" initial={false}>
						{isEmpty ? (
							<motion.div
								key="empty-contacts"
								variants={swapVariants}
								initial="initial"
								animate="animate"
								exit="exit"
								transition={{ ease: [0.26, 0.08, 0.25, 1], duration: 0.2 }}
							>
								<SimpleEmpty
									className="mt-8"
									title={t("peers:empty_search_title")}
									description={t("peers:empty_search_description", { search })}
								/>
							</motion.div>
						) : (
							<motion.div
								key={dataKey}
								variants={swapVariants}
								initial="initial"
								animate="animate"
								exit="exit"
								transition={{ ease: [0.26, 0.08, 0.25, 1], duration: 0.2 }}
							>
								<DataTable
									columns={contactColumns}
									data={data}
									hideHeader
									className={cn(
										"group-data-[host=dialog]/picker:hover:bg-background/90",
										dialogSurface,
									)}
									onRowClick={onContactClick}
								/>
							</motion.div>
						)}
					</AnimatePresence>
				</motion.div>
			</div>
		</MotionConfig>
	);
};
