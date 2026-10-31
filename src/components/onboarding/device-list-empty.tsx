interface DeviceListEmptyProps {
	title: string;
	description?: string;
}

export const DeviceListEmpty = ({
	title,
	description,
}: DeviceListEmptyProps) => (
	<div className="flex min-h-14 flex-col items-center justify-center gap-y-0.5 px-3 py-3">
		<div className="flex flex-row items-center gap-x-2">
			<p className="text-sm">{title}</p>
		</div>
		{description && (
			<p className="text-center text-muted text-xs">{description}</p>
		)}
	</div>
);
