/** biome-ignore-all lint/suspicious/noArrayIndexKey: <> */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";
import {
	AnimatePresence,
	MotionConfig,
	motion,
	type Variants,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { HeroIcon } from "@/components/hero-icon";
import { HolographicEmpty } from "@/components/holographic-empty";
import {
	FilesDialog,
	type FilesDialogHandle,
} from "@/components/main/files-dialog";
import { DataTable } from "@/components/main/table";
import { TransferCard } from "@/components/main/transfer-card";
import { createColumns } from "@/components/main/transfer-columns";
import { queryClient } from "@/lib/store/react-query";
import {
	type StoredTransfer,
	useInboundTransfer,
	useInboundTransfers,
	useOutboundTransfer,
	useOutboundTransfers,
	useTransferStore,
} from "@/lib/store/transfers";
import { cn } from "@/lib/utils";
import { revealTransferFiles } from "@/lib/utils/reveal";

const LIMIT = 10;

const sectionVariants: Variants = {
	hidden: { transform: "translateY(-8px)", opacity: 0 },
	visible: { transform: "translateY(0px)", opacity: 1 },
};

const fetchTransfers = async (page: number) => {
	const offset = page * LIMIT;
	const transfers: StoredTransfer[] = await invoke("get_transfers", {
		pagination: { offset, limit: LIMIT },
	});

	return transfers;
};

export const TansfersPage = () => {
	const [page, setPage] = useState(0);
	const [selectedTransfer, setSelectedTransfer] =
		useState<StoredTransfer | null>(null);

	const inboundTransfers = useInboundTransfers();
	const outboundTransfers = useOutboundTransfers();

	const transferCount = useTransferStore((s) => s.transferCount);
	const setTransferCount = useTransferStore((s) => s.setTransferCount);
	const decreaseTransferCount = useTransferStore(
		(s) => s.decreaseTransferCount,
	);
	const didFetchTransferCount = useRef(false);
	const filesDialogRef = useRef<FilesDialogHandle>(null);

	const { t } = useTranslation(["common", "transfers", "errors"]);

	const pages = transferCount > 0 ? Math.ceil(transferCount / LIMIT) : 1;
	const {
		isError,
		error,
		data: storedTransfers,
	} = useQuery({
		queryKey: ["transfers", page],
		queryFn: () => fetchTransfers(page),
		placeholderData: keepPreviousData,
	});

	const fetchTransferCount = async () => {
		try {
			const count: number = await invoke("get_transfer_count");
			setTransferCount(count);
		} catch (exception) {
			console.log(`[transfer.fetchTransferCount] ${JSON.stringify(exception)}`);
		}
	};

	const onDelete = async (id: string) => {
		try {
			await invoke("delete_transfer", { id });
			queryClient.invalidateQueries({ queryKey: ["transfers", page] });
			decreaseTransferCount();
		} catch (exception) {
			console.log("[transfer.onDelete]", JSON.stringify(exception));
		}
	};

	const onDisplayFiles = (transfer: StoredTransfer) => {
		if ((transfer.files?.length || 0) < 1 || !filesDialogRef.current) return;

		setSelectedTransfer(transfer);
		filesDialogRef.current.present();
	};

	const onRowClick = async (transfer: StoredTransfer) => {
		const files = transfer.files;
		if (!files || files.length === 0) return;

		try {
			const result = await revealTransferFiles(files);
			if (result.revealed === 0) {
				toast.warning(t("files_no_longer_available", { ns: "transfers" }));
			} else if (result.missing > 0) {
				toast.info(
					t("some_files_missing", {
						ns: "transfers",
						count: result.missing,
					}),
				);
			}
		} catch (error) {
			console.error("[transfers.onRowClick]", error);
		}
	};

	const columns = createColumns(t, { onDelete, onDisplayFiles });

	const renderStoredTransfers = () => {
		if (isError)
			return (
				<div className="mt-4 flex w-full items-center justify-center">
					<div className="flex w-2/3 flex-col items-center gap-y-1">
						<div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
							<HeroIcon
								name="exclamation-circle"
								iconStyle="solid"
								className="h-6 w-6 text-red-500"
							/>
						</div>
						<p className="text-center text-lg">
							{t("generic_title", { ns: "errors" })}
						</p>
						<p className="w-2/3 text-center text-muted text-sm">
							{t("fetch_stored_transfers_failed", { ns: "errors" })}{" "}
							{error &&
								`${t("share_with_support", { ns: "errors" })} ${error.message}`}
						</p>
					</div>
				</div>
			);

		if (
			storedTransfers?.length === 0 &&
			outboundTransfers.length === 0 &&
			inboundTransfers.length === 0
		)
			return (
				<HolographicEmpty
					geometry="transfer"
					title={t("empty_previous_title", { ns: "transfers" })}
					description={t("empty_previous_description", { ns: "transfers" })}
				/>
			);

		if (storedTransfers?.length === 0) return null;

		return (
			<div className="px-2">
				<DataTable
					columns={columns}
					data={storedTransfers || []}
					pagination
					page={page}
					pages={pages}
					onPageChange={setPage}
					onRowClick={onRowClick}
				/>
			</div>
		);
	};

	useEffect(() => {
		if (transferCount === -1 && !didFetchTransferCount.current) {
			didFetchTransferCount.current = true;
			fetchTransferCount();
		}
	}, [transferCount]);

	return (
		<div className={cn("pt-16 pb-4", storedTransfers?.length === 0 && "pb-0")}>
			<AnimatePresence initial={false} mode="popLayout">
				<MotionConfig transition={{ duration: 0.2, bounce: 0 }}>
					{(outboundTransfers.length > 0 || inboundTransfers.length > 0) && (
						<motion.section className="mb-8" layout="position">
							<motion.h2
								className="mb-4 ml-2 font-bold text-xl"
								variants={sectionVariants}
								initial="hidden"
								animate="visible"
								exit="hidden"
							>
								{t("active_transfers", { ns: "transfers" })}
							</motion.h2>
							{inboundTransfers.length > 0 && (
								<motion.div
									variants={sectionVariants}
									initial="hidden"
									animate="visible"
									exit="hidden"
								>
									<span className="mb-1 ml-2 block font-medium text-muted opacity-70 dark:opacity-100">
										{t("receiving", { ns: "transfers" })}
									</span>
									<div className="no-scrollbar flex snap-x snap-mandatory flex-row flex-nowrap overflow-x-auto pr-2">
										{inboundTransfers.map((id, i) => (
											<InboundTransfer id={id} key={`inbound-transfer-${i}`} />
										))}
									</div>
								</motion.div>
							)}
							{outboundTransfers.length > 0 && (
								<motion.div
									variants={sectionVariants}
									initial="hidden"
									animate="visible"
									exit="hidden"
								>
									<span className="mt-2 mb-1 ml-2 block font-medium text-muted opacity-70 dark:opacity-100">
										{t("sending", { ns: "transfers" })}
									</span>
									<div className="no-scrollbar flex snap-x snap-mandatory flex-row flex-nowrap overflow-x-auto pr-2">
										{outboundTransfers.map((id, i) => (
											<OutboundTransfer
												id={id}
												key={`outbound-transfer-${i}`}
											/>
										))}
									</div>
								</motion.div>
							)}
						</motion.section>
					)}
					<motion.section layout="position">
						{!isError && (storedTransfers?.length || 0) > 0 && (
							<h2 className="mb-4 ml-2 font-bold text-xl">
								{t("previous_transfers", { ns: "transfers" })}
							</h2>
						)}
						{renderStoredTransfers()}
					</motion.section>
				</MotionConfig>
			</AnimatePresence>
			<FilesDialog
				ref={filesDialogRef}
				title={t("transfers:files_dialog_title")}
				description={t("transfers:files_dialog_description", {
					count: selectedTransfer?.files?.length || 0,
					date: dayjs(selectedTransfer?.createdAt).fromNow(),
				})}
				paths={selectedTransfer?.files || []}
			/>
		</div>
	);
};

type InboundTransferProps = {
	id: number;
};

const InboundTransfer = ({ id }: InboundTransferProps) => {
	const transfer = useInboundTransfer(id);
	return (
		<>
			<div className="w-2 shrink-0 snap-start"></div>
			<TransferCard id={id} transfer={transfer} type="inbound" />
		</>
	);
};

type OutboundTransferProps = {
	id: string;
};

const OutboundTransfer = ({ id }: OutboundTransferProps) => {
	const transfer = useOutboundTransfer(id);
	if (!transfer) return null;
	return (
		<>
			<div className="w-2 shrink-0 snap-start"></div>
			<TransferCard id={id} transfer={transfer} type="outbound" />
		</>
	);
};
