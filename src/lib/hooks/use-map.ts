import { useCallback, useState } from "react";

export function useMap<K, V>(initial?: Iterable<[K, V]>) {
	const [map, setMap] = useState(() => new Map(initial));

	const set = useCallback((key: K, value: V) => {
		setMap((prev) => {
			const copy = new Map(prev);
			copy.set(key, value);
			return copy;
		});
	}, []);

	const remove = useCallback((key: K) => {
		setMap((prev) => {
			const copy = new Map(prev);
			copy.delete(key);
			return copy;
		});
	}, []);

	const clear = useCallback(() => {
		setMap(new Map());
	}, []);

	return {
		map,
		set,
		remove,
		clear,
		entries: [...map.entries()],
		values: [...map.values()],
		keys: [...map.keys()],
	};
}
