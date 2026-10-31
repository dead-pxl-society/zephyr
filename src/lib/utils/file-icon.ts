import type { LucideIconName } from "@/components/lucide-icon";
import { basename, hasTrailingSeparator } from "@/lib/utils/path";

const extensionToMime: Record<string, string> = {
	// Images
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	bmp: "image/bmp",
	ico: "image/x-icon",
	tiff: "image/tiff",
	tif: "image/tiff",
	avif: "image/avif",
	heic: "image/heic",
	heif: "image/heif",

	// Video
	mp4: "video/mp4",
	mov: "video/quicktime",
	avi: "video/x-msvideo",
	mkv: "video/x-matroska",
	webm: "video/webm",
	flv: "video/x-flv",
	wmv: "video/x-ms-wmv",

	// Audio
	mp3: "audio/mpeg",
	wav: "audio/wav",
	ogg: "audio/ogg",
	flac: "audio/flac",
	aac: "audio/aac",
	m4a: "audio/mp4",
	wma: "audio/x-ms-wma",

	// Archives
	zip: "application/zip",
	tar: "application/x-tar",
	gz: "application/gzip",
	"7z": "application/x-7z-compressed",
	rar: "application/vnd.rar",
	bz2: "application/x-bzip2",
	xz: "application/x-xz",
	zst: "application/zstd",

	// 3D/AR
	obj: "model/obj",
	fbx: "model/fbx",
	gltf: "model/gltf+json",
	glb: "model/gltf-binary",
	stl: "model/stl",
	usdz: "model/vnd.usdz+zip",
	dae: "model/vnd.collada+xml",
	"3ds": "model/x-3ds",

	// Code
	js: "text/javascript",
	ts: "text/typescript",
	tsx: "text/tsx",
	jsx: "text/jsx",
	py: "text/x-python",
	rs: "text/x-rust",
	go: "text/x-go",
	c: "text/x-c",
	cpp: "text/x-c++",
	h: "text/x-c",
	java: "text/x-java",
	rb: "text/x-ruby",
	php: "text/x-php",
	swift: "text/x-swift",
	kt: "text/x-kotlin",
	cs: "text/x-csharp",
	html: "text/html",
	css: "text/css",
	scss: "text/x-scss",
	vue: "text/x-vue",
	svelte: "text/x-svelte",
	sh: "text/x-shellscript",
	bash: "text/x-shellscript",
	zsh: "text/x-shellscript",
	sql: "text/x-sql",
	lua: "text/x-lua",
	zig: "text/x-zig",
	ex: "text/x-elixir",
	erl: "text/x-erlang",
	r: "text/x-r",
	dart: "text/x-dart",
	scala: "text/x-scala",
	pl: "text/x-perl",
	hs: "text/x-haskell",
	ml: "text/x-ocaml",
	clj: "text/x-clojure",
	nim: "text/x-nim",
	v: "text/x-v",
	wat: "text/x-wat",
	wasm: "application/wasm",

	// Config
	json: "application/json",
	yaml: "application/x-yaml",
	yml: "application/x-yaml",
	toml: "application/toml",
	xml: "application/xml",
	ini: "text/x-ini",
	env: "text/x-env",
	conf: "text/x-conf",
	config: "text/x-conf",
	lock: "text/x-lock",
	editorconfig: "text/x-editorconfig",
	prettierrc: "application/json",
	eslintrc: "application/json",
	gitignore: "text/x-gitignore",
	dockerignore: "text/x-dockerignore",
	makefile: "text/x-makefile",

	// Text/Docs
	txt: "text/plain",
	md: "text/markdown",
	rtf: "text/rtf",
	log: "text/plain",
	pdf: "application/pdf",
	doc: "application/msword",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

	// Spreadsheets
	xls: "application/vnd.ms-excel",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	ods: "application/vnd.oasis.opendocument.spreadsheet",
	numbers: "application/x-iwork-numbers",
	csv: "text/csv",

	// Fonts
	ttf: "font/ttf",
	otf: "font/otf",
	woff: "font/woff",
	woff2: "font/woff2",
	eot: "application/vnd.ms-fontobject",

	// Certificates
	pem: "application/x-pem-file",
	crt: "application/x-x509-ca-cert",
	cer: "application/x-x509-ca-cert",
	der: "application/x-x509-ca-cert",
	p12: "application/x-pkcs12",
	pfx: "application/x-pkcs12",

	// Keys
	key: "application/x-pem-file-key",

	// Binary/Executables
	exe: "application/x-msdownload",
	dll: "application/x-msdownload",
	so: "application/x-sharedlib",
	dylib: "application/x-sharedlib",
	bin: "application/octet-stream",
	apk: "application/vnd.android.package-archive",
	dmg: "application/x-apple-diskimage",
	msi: "application/x-msi",
	deb: "application/x-deb",
	rpm: "application/x-rpm",
	app: "application/x-executable",
};

export function mimeFromPath(path: string): string {
	if (hasTrailingSeparator(path)) {
		return "folder";
	}

	const filename = basename(path);
	const dotIndex = filename.lastIndexOf(".");

	if (dotIndex === -1) {
		return "folder";
	}

	const ext = filename.slice(dotIndex + 1).toLowerCase();
	return extensionToMime[ext] ?? "application/octet-stream";
}

const textDocMimes = new Set([
	"text/plain",
	"text/markdown",
	"text/rtf",
	"text/csv",
]);

const textConfigMimes = new Set([
	"text/x-ini",
	"text/x-env",
	"text/x-conf",
	"text/x-lock",
	"text/x-editorconfig",
	"text/x-gitignore",
	"text/x-dockerignore",
	"text/x-makefile",
]);

const archiveMimes = new Set([
	"application/zip",
	"application/x-tar",
	"application/gzip",
	"application/x-7z-compressed",
	"application/vnd.rar",
	"application/x-bzip2",
	"application/x-xz",
	"application/zstd",
]);

const spreadsheetMimes = new Set([
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.oasis.opendocument.spreadsheet",
	"application/x-iwork-numbers",
]);

const configMimes = new Set([
	"application/json",
	"application/x-yaml",
	"application/toml",
	"application/xml",
]);

const documentMimes = new Set([
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const certificateMimes = new Set([
	"application/x-pem-file",
	"application/x-x509-ca-cert",
	"application/x-pkcs12",
]);

const executableMimes = new Set([
	"application/x-msdownload",
	"application/x-sharedlib",
	"application/x-executable",
	"application/vnd.android.package-archive",
	"application/x-apple-diskimage",
	"application/x-msi",
	"application/x-deb",
	"application/x-rpm",
	"application/wasm",
]);

export function mimeToFileIcon(mime: string): LucideIconName {
	if (mime === "folder") return "folder-closed";
	if (mime.startsWith("image/")) return "file-image";
	if (mime.startsWith("video/")) return "file-video-camera";
	if (mime.startsWith("audio/")) return "file-volume";
	if (mime.startsWith("font/") || mime === "application/vnd.ms-fontobject")
		return "file-type-corner";
	if (mime.startsWith("model/")) return "file-box";

	if (mime.startsWith("text/")) {
		if (textDocMimes.has(mime)) return "file-text";
		if (textConfigMimes.has(mime)) return "file-cog";
		return "file-code-corner";
	}

	if (archiveMimes.has(mime)) return "folder-archive";
	if (spreadsheetMimes.has(mime)) return "file-chart-pie";
	if (configMimes.has(mime)) return "file-cog";
	if (documentMimes.has(mime)) return "file-text";
	if (certificateMimes.has(mime)) return "file-badge";
	if (mime === "application/x-pem-file-key") return "file-key";
	if (executableMimes.has(mime)) return "file-digit";
	if (mime === "application/octet-stream") return "file";

	return "file";
}
