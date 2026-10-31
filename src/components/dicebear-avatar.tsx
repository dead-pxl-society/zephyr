import type * as AvatarPrimitive from "@radix-ui/react-avatar";
import type { ComponentProps } from "react";
import useAvatar from "@/lib/hooks/use-avatar";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

type DicebearAvatarProps = {
	seed?: string;
	containerClassName?: string;
} & ComponentProps<typeof AvatarPrimitive.Root>;

export const DicebearAvatar = ({
	seed,
	containerClassName,
	...avatarProps
}: DicebearAvatarProps) => {
	const seedy = seed || "default-seed";
	const { uri } = useAvatar(seedy);

	return (
		// Either Avatar or the actual image are not fully round, this fixes it but
		// interestingly the scale must end on an odd number like 0.97 or 0.99, if it is
		// 0.98 it will have the same issue. I have not researched why though.
		<div
			className={cn("overflow-hidden rounded-full", containerClassName)}
			style={{ transform: `scale(0.99)` }}
		>
			<Avatar {...avatarProps}>
				<AvatarImage src={uri || ""} />
				<AvatarFallback>AV</AvatarFallback>
			</Avatar>
		</div>
	);
};
