#!/usr/bin/env bash
# Check out upstream Immich at a release tag and apply patches/ on top.
#
# Usage: scripts/prepare-source.sh VERSION DEST [SOURCE_URL]
#
#   VERSION     upstream release tag, for example v3.3.5
#   DEST        directory to create; it must not exist yet
#   SOURCE_URL  public source URL that the web build shows on the login and
#               shared-link pages (PUBLIC_IMMICH_SOURCE_URL); optional
#
# Set WITH_SUBMODULES=1 to also fetch e2e/test-assets for the E2E specs.
# On a patch that does not apply, the script names it, lists the conflicts
# and exits with status 1, leaving DEST in the failed `git am` state.
set -euo pipefail

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  echo "usage: $0 VERSION DEST [SOURCE_URL]" >&2
  exit 2
fi

version=$1
dest=$2
source_url=${3:-}
upstream=${UPSTREAM_REPOSITORY_URL:-https://github.com/immich-app/immich.git}
patches=$(cd "$(dirname "$0")/../patches" && pwd)

if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "invalid upstream version: $version" >&2
  exit 2
fi
if [ -e "$dest" ]; then
  echo "$dest already exists" >&2
  exit 2
fi

git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$version" "$upstream" "$dest"
cd "$dest"
echo "Upstream $version: $(git rev-parse HEAD)"

if [ "${WITH_SUBMODULES:-0}" = 1 ]; then
  git submodule update --quiet --init --depth 1 e2e/test-assets
fi

shopt -s nullglob
series=("$patches"/*.patch)
if [ ${#series[@]} -eq 0 ]; then
  echo "no patches found in $patches" >&2
  exit 1
fi

# `git am -3` needs the blobs the patches were made against to fall back to a
# three-way merge. The series records its upstream base (format-patch --base).
base=$(sed -n 's/^base-commit: //p' "${series[@]}" | head -n 1)
if [ -n "$base" ] && ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  git fetch --quiet --depth 1 origin "$base"
fi

# The identity only labels the local commits; nothing from this checkout is pushed.
if ! git -c user.name=immich-dkn -c user.email=immich-dkn@users.noreply.github.com \
  am --quiet -3 "${series[@]}"; then
  # Read the stopped session's state from files: a failing diagnostic must not
  # end the script (set -e) before the report below is complete.
  next=$(cat "$(git rev-parse --git-path rebase-apply/next 2>/dev/null)" 2>/dev/null || echo 1)
  applied=$((next - 1))
  patch=${series[$applied]}
  subject=$(sed -n 's/^Subject: \(\[PATCH[^]]*\] \)\{0,1\}//p' "$patch" | head -n 1 || true)
  echo "::error title=Patch failed::${patch##*/} ($subject) does not apply to $version"
  echo "Applied cleanly: $applied of ${#series[@]}"
  echo "Failed patch: ${patch##*/}"
  echo "Conflicts:"
  git diff --name-only --diff-filter=U 2>/dev/null | sed 's/^/  /' || true
  exit 1
fi

for patch in "${series[@]}"; do
  echo "Applied ${patch##*/}"
done

# svelte.config.js loads web/.env through dotenv. Upstream's web stage declares no
# build argument for this variable, and .dockerignore only drops the root .env*.
if [ -n "$source_url" ]; then
  printf 'PUBLIC_IMMICH_SOURCE_URL=%s\n' "$source_url" > web/.env
  echo "PUBLIC_IMMICH_SOURCE_URL=$source_url"
fi
