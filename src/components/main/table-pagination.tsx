import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";

interface TablePaginationProps {
	page: number;
	pages: number;
	onPageChange?: (newPage: number) => void;
}

export function TablePagination({
	page,
	pages,
	onPageChange,
}: TablePaginationProps) {
	const { t } = useTranslation();

	const canGoBack = page > 0;
	const canGoForward = page < pages - 1;

	const previousPage = () => {
		if (!canGoBack) return;
		if (onPageChange) onPageChange(page - 1);
	};

	const nextPage = () => {
		if (!canGoForward) return;
		if (onPageChange) onPageChange(page + 1);
	};

	const firstPage = () => {
		if (onPageChange) onPageChange(0);
	};

	const lastPage = () => {
		if (onPageChange) onPageChange(pages - 1);
	};

	return (
		<div className="flex items-center justify-end px-2 pt-2">
			<div className="flex items-center space-x-6 lg:space-x-8">
				<div className="flex w-[100px] items-center justify-center font-medium text-sm">
					{t("pagination_page_of", { page: page + 1, total: pages })}
				</div>
				<div className="flex items-center space-x-2">
					<Button
						variant="outline"
						size="icon"
						className="hidden size-8 rounded-full lg:flex"
						onClick={firstPage}
						disabled={!canGoBack}
					>
						<span className="sr-only">{t("pagination_go_first")}</span>
						<ChevronsLeft />
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="size-8 rounded-full"
						onClick={previousPage}
						disabled={!canGoBack}
					>
						<span className="sr-only">{t("pagination_previous")}</span>
						<ChevronLeft />
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="size-8 rounded-full"
						onClick={nextPage}
						disabled={!canGoForward}
					>
						<span className="sr-only">{t("pagination_next")}</span>
						<ChevronRight />
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="hidden size-8 rounded-full lg:flex"
						onClick={lastPage}
						disabled={!canGoForward}
					>
						<span className="sr-only">{t("pagination_go_last")}</span>
						<ChevronsRight />
					</Button>
				</div>
			</div>
		</div>
	);
}
