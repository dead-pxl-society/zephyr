import { type SetStateAction, useRef, useState } from "react";

export const useStateRef = <T>(initialValue: T) => {
	const [value, _setValue] = useState<T>(initialValue);
	const valueRef = useRef<T>(initialValue);

	const setValue = (action: SetStateAction<T>) => {
		_setValue((prev) => {
			const next =
				typeof action === "function"
					? (action as (prev: T) => T)(prev)
					: action;

			valueRef.current = next;
			return next;
		});
	};

	const setValueRef = (newValue: T) => {
		valueRef.current = newValue;
	};

	return [value, setValue, valueRef, setValueRef] as const;
};
