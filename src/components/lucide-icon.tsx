import {
	ArrowBigUp,
	Command,
	ExternalLink,
	File,
	FileBadge,
	FileBox,
	FileChartPie,
	FileCodeCorner,
	FileCog,
	FileDigit,
	FileImage,
	FileKey,
	FileText,
	FileTypeCorner,
	FileVideoCamera,
	FileVolume,
	FolderArchive,
	FolderClosed,
	Hand,
	HandGrab,
	Headset,
	MonitorSmartphone,
	Package,
	Package2,
	ShieldCheck,
	ShieldOff,
	SquareX,
	UserRoundCheck,
} from "lucide-react";
import type { SVGProps } from "react";

export type LucideIconName =
	| "arrow-big-up"
	| "command"
	| "external-link"
	| "file"
	| "file-badge"
	| "file-box"
	| "file-chart-pie"
	| "file-code-corner"
	| "file-cog"
	| "file-digit"
	| "file-image"
	| "file-key"
	| "file-text"
	| "file-type-corner"
	| "file-video-camera"
	| "file-volume"
	| "folder-archive"
	| "folder-closed"
	| "hand"
	| "headset"
	| "hand-grab"
	| "monitor-smartphone"
	| "package"
	| "package2"
	| "shield-check"
	| "shield-off"
	| "square-x"
	| "user-round-check";

export type LucideIconProps = {
	name: LucideIconName;
} & SVGProps<SVGSVGElement>;

export const LucideIcon = ({ name, ...props }: LucideIconProps) => {
	const renderIcon = () => {
		switch (name) {
			case "arrow-big-up":
				return <ArrowBigUp {...props} />;
			case "command":
				return <Command {...props} />;
			case "hand":
				return <Hand {...props} />;
			case "headset":
				return <Headset {...props} />;
			case "hand-grab":
				return <HandGrab {...props} />;
			case "monitor-smartphone":
				return <MonitorSmartphone {...props} />;
			case "package":
				return <Package {...props} />;
			case "package2":
				return <Package2 {...props} />;
			case "external-link":
				return <ExternalLink {...props} />;
			case "file":
				return <File {...props} />;
			case "file-badge":
				return <FileBadge {...props} />;
			case "file-box":
				return <FileBox {...props} />;
			case "file-chart-pie":
				return <FileChartPie {...props} />;
			case "file-code-corner":
				return <FileCodeCorner {...props} />;
			case "file-cog":
				return <FileCog {...props} />;
			case "file-digit":
				return <FileDigit {...props} />;
			case "file-image":
				return <FileImage {...props} />;
			case "file-key":
				return <FileKey {...props} />;
			case "file-text":
				return <FileText {...props} />;
			case "file-type-corner":
				return <FileTypeCorner {...props} />;
			case "file-video-camera":
				return <FileVideoCamera {...props} />;
			case "file-volume":
				return <FileVolume {...props} />;
			case "folder-archive":
				return <FolderArchive {...props} />;
			case "folder-closed":
				return <FolderClosed {...props} />;
			case "shield-check":
				return <ShieldCheck {...props} />;
			case "shield-off":
				return <ShieldOff {...props} />;
			case "square-x":
				return <SquareX {...props} />;
			case "user-round-check":
				return <UserRoundCheck {...props} />;
		}
	};

	return renderIcon();
};
