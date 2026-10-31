import { toast } from "sonner";
import i18n from "./i18n";

/**
 * Shape of every error rejected by a Tauri command. `code` is a stable
 * identifier the backend guarantees; `message` is debug text and is never
 * shown to the user directly.
 */
export interface BackendError {
	code: string;
	message: string;
}

export const isBackendError = (e: unknown): e is BackendError =>
	typeof e === "object" &&
	e !== null &&
	typeof (e as BackendError).code === "string";

export const errorCode = (e: unknown): string =>
	isBackendError(e) ? e.code : "generic";

/**
 * Translated text for an error thrown by `invoke`. Codes with their own
 * wording in the `errors` namespace win; anything else uses `fallbackKey`,
 * which lets each call site describe what the user was trying to do.
 */
export const errorMessage = (
	e: unknown,
	fallbackKey = "errors:generic",
): string => {
	const code = errorCode(e);
	const key = `errors:${code}`;

	if (code !== "generic" && i18n.exists(key)) return i18n.t(key);

	return i18n.t(fallbackKey);
};

export const toastError = (e: unknown, fallbackKey = "errors:generic") => {
	console.error(e);
	toast.error(errorMessage(e, fallbackKey));
};
