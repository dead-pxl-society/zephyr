#!/usr/bin/env bash
#
# Bump the app version everywhere it is declared and commit.
#
#   ./scripts/bump-version.sh 0.2.0
#
# The version lives in three places, and they have to move together.

set -euo pipefail

VERSION="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "$VERSION" ]; then
	echo "usage: $0 <version>   e.g. $0 0.2.0" >&2
	exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
	echo "error: '$VERSION' is not a semver version (expected e.g. 0.2.0)" >&2
	exit 1
fi

if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
	echo "error: working tree is dirty; commit or stash first" >&2
	exit 1
fi

cd "$ROOT"

echo "Bumping to $VERSION"

# package.json
node -e '
	const fs = require("fs");
	const p = "package.json";
	const j = JSON.parse(fs.readFileSync(p, "utf8"));
	j.version = process.argv[1];
	fs.writeFileSync(p, JSON.stringify(j, null, "\t") + "\n");
' "$VERSION"

# tauri.conf.json
node -e '
	const fs = require("fs");
	const p = "src-tauri/tauri.conf.json";
	let s = fs.readFileSync(p, "utf8");
	s = s.replace(/("version":\s*")[^"]+(")/, `$1${process.argv[1]}$2`);
	fs.writeFileSync(p, s);
' "$VERSION"

# Cargo.toml — only the [package] version, which is the first one in the file.
node -e '
	const fs = require("fs");
	const p = "src-tauri/Cargo.toml";
	let s = fs.readFileSync(p, "utf8");
	s = s.replace(/^version = "[^"]+"$/m, `version = "${process.argv[1]}"`);
	fs.writeFileSync(p, s);
' "$VERSION"

# Refresh Cargo.lock so the bumped package version is recorded there too,
# otherwise the first CI build rewrites the lockfile on its own.
cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1 >/dev/null

echo
git --no-pager diff --stat
echo

git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock

if git diff --cached --quiet; then
	echo "Already at $VERSION; nothing to commit."
	exit 0
fi

git commit -m "chore: bump version to v$VERSION"
