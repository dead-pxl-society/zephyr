import {
	Children,
	type PropsWithChildren,
	useCallback,
	useEffect,
	useState,
} from "react";

export const TesterSwitch = ({ children }: PropsWithChildren) => {
	const items = Children.toArray(children);
	const [index, setIndex] = useState(0);

	const next = useCallback(() => {
		setIndex((i) => (i + 1) % items.length);
	}, [items.length]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "m") next();
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [next]);

	if (items.length === 0) return null;

	return <>{items[index]}</>;
};
