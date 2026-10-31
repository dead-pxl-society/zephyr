import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	useReactTable,
} from "@tanstack/react-table";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TablePagination } from "./table-pagination";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	pagination?: boolean;
	hideHeader?: boolean;
	page?: number;
	pages?: number;
	className?: string;
	onPageChange?: (newPage: number) => void;
	onRowClick?: (row: TData) => void;
}

export function DataTable<TData, TValue>({
	columns,
	data,
	pagination = false,
	hideHeader = false,
	page = 0,
	pages = 1,
	className,
	onPageChange,
	onRowClick,
}: DataTableProps<TData, TValue>) {
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
	});

	return (
		<div>
			<div
				className={cn(
					"overflow-hidden rounded-md border-border/60 bg-background-top shadow dark:border-[0.5px] dark:bg-background-top/60",
					className,
				)}
			>
				<Table>
					{!hideHeader && (
						<TableHeader className="text-border">
							{table.getHeaderGroups().map((headerGroup) => (
								<TableRow
									key={headerGroup.id}
									className="bg-border/60 hover:bg-border/60"
								>
									{headerGroup.headers.map((header) => {
										return (
											<TableHead key={header.id}>
												{header.isPlaceholder
													? null
													: flexRender(
															header.column.columnDef.header,
															header.getContext(),
														)}
											</TableHead>
										);
									})}
								</TableRow>
							))}
						</TableHeader>
					)}
					<TableBody>
						{table.getRowModel().rows.map((row) => (
							<TableRow
								key={row.id}
								data-state={row.getIsSelected() && "selected"}
								onClick={() => onRowClick?.(row.original)}
								className={
									onRowClick
										? "group cursor-pointer border-border/60"
										: "group border-border/60"
								}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			{pagination && (
				<TablePagination
					page={page}
					pages={pages}
					onPageChange={onPageChange}
				/>
			)}
		</div>
	);
}
