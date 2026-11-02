# immich-dkn

An unofficial build of the [Immich](https://github.com/immich-app/immich)
`immich-server` image with a patched web app. The Immich project does not
support it.

The patches add:

- a **Select whole stack** toggle to bulk selection in the timeline: while it
  is on, selected stack primaries expand to every stack member before an
  action runs, and the action aborts if the stack lookup fails;
- selection in the asset viewer: mark the asset on screen (`x`), clear marks
  (`Ctrl+D`), trash or delete the marked set, and, with whole-stack selection
  on (`Shift+S`), apply viewer actions to every member of the stack on screen;
- a **Source** link on the login and shared-link pages that points at this
  repository.

With the toggle off, the web app behaves as upstream. The server, the
machine-learning image and the mobile app are the official upstream releases.

## Images

| Tag | Meaning |
| --- | --- |
| `ghcr.io/davidkneubuehler/immich-server:vX.Y.Z` | newest build for upstream `vX.Y.Z`; moves when the patches change |
| `ghcr.io/davidkneubuehler/immich-server:dkn-vX.Y.Z-N` | revision `N` for upstream `vX.Y.Z`; never moves |

Use the image in place of `ghcr.io/immich-app/immich-server` and keep the
official `immich-machine-learning` image of the same version. Each image is
built for `linux/amd64` and `linux/arm64`, signed keyless with cosign and has
a GitHub build provenance attestation. The release `dkn-vX.Y.Z-N` lists the
digest and the commands to verify it, for example:

```sh
gh attestation verify oci://ghcr.io/davidkneubuehler/immich-server@sha256:... \
  -R davidkneubuehler/immich-dkn
```

## How a release is built

[`.github/workflows/release.yml`](.github/workflows/release.yml) runs daily and
on manual dispatch (optionally for a given upstream version):

1. Find the newest upstream release that is not a prerelease, and the digest
   of its official `immich-server` image. Stop if the newest
   `dkn-vX.Y.Z-N` release already has the current patches, otherwise pick the
   next `N`.
2. Check out `immich-app/immich` at the tag inside the run and apply
   [`patches/`](patches) with `git am -3`
   ([`scripts/prepare-source.sh`](scripts/prepare-source.sh)).
3. Run the web unit tests, svelte-check and the TypeScript check, and in
   parallel build the image and run the stack-selection and source-link E2E
   specs against it.
4. Build the web app with upstream's own `server/Dockerfile` stage `web`
   (same Node, pnpm and lockfile as the official image), copy it over
   `/build/www` of the official image ([`Dockerfile`](Dockerfile),
   [`docker-bake.hcl`](docker-bake.hcl)), push, sign, attest and create the
   GitHub release.

Only runs on `main` push, release and report failures. A manual run on another
branch stops after the checks and the E2E build.

If a patch does not apply or a check fails, the run publishes nothing and
opens or updates the issue "Release failed for upstream vX.Y.Z" with the
failing patch and the log.

## Source code and license

Immich is licensed under the [GNU AGPL v3](LICENSE), and so is this
modification. The corresponding source of the image `dkn-vX.Y.Z-N` is the
upstream tag `vX.Y.Z` with the patches in this repository at the tag
`dkn-vX.Y.Z-N` applied in order. The release names the exact upstream commit.
The Source link in the web app and `IMMICH_SOURCE_URL` in the server point at
that tag.

## Working on the patches

The patches are a `git format-patch` series made against an upstream tag. To
change them or carry them to a new upstream release:

```sh
version=v3.3.5
work=$(mktemp -d)/immich
scripts/prepare-source.sh "$version" "$work"   # upstream tag + patches as commits
```

If a patch does not apply, the script names it and leaves `git am` stopped in
`$work`: resolve the conflicts, `git add` them and run `git am --continue`.
Then edit and commit in `$work` (amend or fix up the existing commits rather
than stacking new ones), run the checks with upstream's Node version from
`.nvmrc` and its pnpm version from `package.json`:

```sh
cd "$work"
pnpm install --frozen-lockfile --filter immich-web... --filter @immich/sdk
pnpm --filter @immich/sdk build
cd web
pnpm exec vitest run && pnpm run check:svelte && pnpm run check:typescript && pnpm run lint
```

and write the series back:

```sh
rm patches/*.patch
git -C "$work" format-patch --zero-commit --no-signature --base="$version" \
  -o "$PWD/patches" "$version"
```

`--base` records the upstream commit, which `prepare-source.sh` fetches so
that `git am -3` can fall back to a three-way merge on later releases.

To build an image locally (Docker with Buildx):

```sh
scripts/prepare-source.sh "$version" upstream https://example.invalid/source
UPSTREAM_VERSION=$version docker buildx bake --load --set server.tags=immich-server:dev
```
