import { cn } from "@/lib/utils";

export type SimpleEmptyProps = {
	title: string;
	description?: string;
	className?: string;
};

export const SimpleEmpty = ({
	title,
	description,
	className,
}: SimpleEmptyProps) => (
	<div
		className={cn("mt-4 flex w-full items-center justify-center", className)}
	>
		<div className="flex w-2/3 flex-col items-center">
			<p className="text-center text-lg">{title}</p>
			{description && (
				<p className="w-2/3 text-center text-muted text-sm">{description}</p>
			)}
		</div>
	</div>
);
