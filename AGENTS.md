# Agent instructions

This repository builds `ghcr.io/davidkneubuehler/immich-server` from an
upstream Immich tag plus the patch series in `patches/`. Read `README.md` for
how the build and release work.

## Contribution cycle

- Change only `patches/` and documentation (`README.md`, `AGENTS.md`).
  Changes to `Dockerfile`, `docker-bake.hcl`, `.dockerignore` or `scripts/`
  need Dave's explicit request in the conversation.
- Never edit `.github/workflows/`. The agent token has no Workflows
  permission, and the release pipeline stays Dave's.
- Work on a branch and open a pull request against `main`; Dave reviews and
  merges it. Do not push to `main`, create tags or releases, or run the
  release workflow. A merged patch change reaches production only through the
  next workflow run.
- Never push to or open pull requests against `immich-app/immich`, and never
  push the upstream checkout anywhere.

## Changing the patches

- Regenerate the series from an upstream checkout in `$TMPDIR`, never by
  editing `.patch` files by hand:
  1. `scripts/prepare-source.sh vX.Y.Z "$TMPDIR/immich-<topic>"` checks out the
     tag and applies the series as commits. On a conflict it names the patch;
     resolve it there and `git am --continue`.
  2. Edit and commit there. Keep one commit per logical change and amend the
     commit a fix belongs to instead of adding fix-up commits. Commit messages
     follow upstream's Conventional Commits style (`feat(web): ...`).
  3. Run the web checks there with upstream's Node version (`.nvmrc`; newer
     Node breaks the vitest DOM setup) and pnpm version (`package.json`):
     `vitest run`, `check:svelte`, `check:typescript` and `lint` in `web/`.
  4. Replace `patches/*.patch` with
     `git format-patch --zero-commit --no-signature --base=vX.Y.Z -o <repo>/patches vX.Y.Z`.
- Base the series on the newest upstream release the workflow builds, and
  check that it still applies to the release before it when that is cheap.
- The patches touch only `web/`, `i18n/` and `e2e/`. Keep server, mobile and
  machine-learning code out of them: the image takes the server from the
  official upstream image.
- The E2E specs `e2e/src/specs/web/stack-selection.e2e-spec.ts` and
  `source-link.e2e-spec.ts` run only in CI; say so when a change depends on
  them.

## Pull requests

Report what changed in the series, the upstream version it was regenerated
against, the checks run locally and their results, and what only CI can show.
