# Downstream maintenance and release guide

This repository is an unofficial, publicly available downstream of Immich. It is based on upstream `v3.2.1` at `6420baac8307bb9ad14963578782fa0539947332` and is not supported by the Immich project.

## Included change

The web application adds an opt-in whole-stack selection toggle. It is off by default, preserving upstream primary-asset selection. When enabled, a selection operation expands a selected stack primary to its members before bulk actions run. The server image contains this web patch. Mobile and machine-learning artifacts are upstream artifacts.

## Updating the downstream

Start from an upstream release tag, transplant the downstream commits, resolve only web or relevant E2E conflicts, and re-run the focused checks below. Rebuild `immich-server` before any publication because it bundles the web application. Do not treat a clean transplant as proof of deployment compatibility.

Run the focused web unit and static checks, then the stack-selection Playwright specification through `e2e/docker-compose.yml`. The E2E environment is disposable only in CI; do not reset or remove an existing local E2E environment as part of this check. Keep the exact upstream base and downstream commit range recorded in the release notes or tag annotation.

## Images, rollback, and source availability

The release workflow accepts only downstream tags named `dkn-vX.Y.Z` (with an optional prerelease suffix) and publishes `ghcr.io/<repository-owner>/immich-server:dkn-vX.Y.Z`. Deploy by digest after verification. To roll back, redeploy the previously verified image digest and follow the upstream release compatibility and database-backup guidance for the target version.

Before making a downstream image available, publish the corresponding complete source at the same tag or commit. Release builds pass that exact commit URL as `BUILD_SOURCE_URL`, which is baked into the web application for the unauthenticated login and shared-link pages. Authenticated Help continues to read `IMMICH_THIRD_PARTY_SOURCE_URL` from the server about response, so deployments must set it to the same published source URL. The image is AGPL-3.0-only; make the corresponding source available for every distributed version.

## Security cadence

Dependency and base-image vulnerabilities are inherited from upstream and are not patched here, so the downstream stays a minimal web patch. The release workflow scans the downstream image and the official upstream `immich-server` image pinned in `UPSTREAM_IMAGE`, and fails only on fixable HIGH or CRITICAL findings that upstream does not have. Update `UPSTREAM_IMAGE` to the matching upstream release digest whenever the downstream moves to a new upstream release.

Check upstream releases and security advisories at least weekly and after any relevant advisory. For a security update, transplant onto the supported upstream release, repeat the focused validation and production image build, review the image digest, SBOM, vulnerability scan, signature, and provenance, then publish a new downstream tag. Preserve a known-good digest for rollback.

## Release checklist

- Confirm the upstream base, downstream commit range, and the default-off behavior.
- Run focused web unit/static checks and the stack-selection and source-link E2E specifications.
- Build `immich-server`; review its digest, CycloneDX SBOM, vulnerability scan, keyless signature, and provenance.
- Verify the baked `BUILD_SOURCE_URL` and runtime `IMMICH_THIRD_PARTY_SOURCE_URL` point to the matching public source before serving users.
- Publish only the `immich-server` image under the downstream tag convention and retain the previous verified digest.
