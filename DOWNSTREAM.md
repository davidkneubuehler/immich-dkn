# Downstream maintenance and release guide

This repository is an unofficial, publicly available downstream of Immich. The default branch `downstream/vX.Y.Z` carries the downstream patch on upstream tag `vX.Y.Z`. It is not supported by the Immich project.

## Included change

The web application adds an opt-in whole-stack selection toggle. It is off by default, preserving upstream primary-asset selection. When enabled, a selection operation expands a selected stack primary to its members before bulk actions run. The server image contains this web patch. Mobile and machine-learning artifacts are upstream artifacts.

## Upstream release tracking

`.github/workflows/dkn-upstream-sync.yml` runs daily and on manual dispatch. Nobody needs to check upstream by hand.

1. It finds the highest published, non-prerelease release of `immich-app/immich` and derives the current base from the default branch name.
2. If that release is not newer than the base, if `sync/vX.Y.Z` or `downstream/vX.Y.Z` already exists, or if the official `immich-server` image for the release is not published yet, it stops without changing anything.
3. Otherwise it cherry-picks the downstream commits (base tag..default branch) onto the upstream tag. If the pinned `UPSTREAM_IMAGE` in `dkn-release.yml` differs, it adds one commit that pins the official image of the new release.
4. On a conflict it aborts, creates no branches, and fails the run. The run summary lists the conflicting commit, the conflicting files, and the commits applied and not applied.
5. On success it creates `upstream-base/vX.Y.Z` at the upstream tag and `sync/vX.Y.Z` with the transplanted commits. It then runs `dkn-stack-selection.yml` against the candidate, builds the production `immich-server` image for linux/amd64 without pushing it, and compares its fixable HIGH and CRITICAL findings with the official image of the same upstream version.
6. It opens a pull request from `sync/vX.Y.Z` into `upstream-base/vX.Y.Z`, so the diff is exactly the downstream patch, and requests a review from the repository owner. The body links the upstream release notes, lists security advisories published since the previous base or referenced in the release notes, and includes the validation results and the scanner comparison. If validation or the comparison fails, the pull request is still opened and the run fails.

Automation never approves, merges, signs, tags, publishes images, or creates releases. The pull request exists only for review and is closed, not merged, after the release.

For testing, dispatch the workflow with `upstream_tag` (for example `v3.2.1`) and optionally `source_branch` (`downstream/vX.Y.Z` or `dkn-test/*`). An explicit tag skips the "newer release" check but still stops when `sync/<tag>` exists.

### Notifications

| Situation | What happens | Notification |
| --- | --- | --- |
| No newer upstream release, or a candidate already exists | The run succeeds and does nothing. | None. |
| Clean transplant | Branches and a review pull request are created. | Pull request review request from `github-actions`. If validation or the scan comparison fails, also a failed-run notification. |
| Conflict | The run fails with a conflict summary. It fails again on every daily run until `downstream/vX.Y.Z` exists. | Failed-run notification for `Downstream upstream sync`. |

GitHub sends scheduled-run notifications to the user who last modified the cron line in the workflow file. Keep standard Actions failure notifications enabled.

### Scheduled workflow inactivity limit

GitHub disables scheduled workflows in public repositories after 60 days without repository activity. GitHub does not document what counts as activity, whether re-enabling a workflow resets the period, or whether it warns before disabling. No reliable mechanism without commits is documented.

The workflow therefore does two best-effort things on every run, without committing to `downstream/*`:

- it calls the enable-workflow API for itself;
- when the repository has had no push for 45 days, it recreates the `dkn-keepalive` branch at the default branch head and checks that the repository's last-push time moved. If it did not, the run fails, which is a notification at least 15 days before the limit.

Upstream releases also create branches, and every downstream release pushes a branch and a tag, which are normal repository activity. If the workflow is ever shown as disabled, re-enable it with `gh workflow enable dkn-upstream-sync.yml` and dispatch it once.

## Release flow

1. **Notification.** A review request for "Review downstream patch on Immich vX.Y.Z", or a failed `Downstream upstream sync` run.
2. **Conflict.** If the run failed with a conflict, recreate the transplant locally from the summary: branch from upstream `vX.Y.Z`, cherry-pick the listed commits, resolve only web, relevant E2E, or downstream workflow conflicts, and continue at step 4 with that branch. Run the checks in `dkn-stack-selection.yml` locally before pushing.
3. **Review the pull request.** Read the diff, the upstream release notes, the linked advisories, the validation results, and the scanner comparison. Do not merge it.
4. **Create the signed release branch locally with agent-git.** Commits made by automation are unsigned, so re-create them:

   ```bash
   git fetch --no-tags https://github.com/<owner>/<repository>.git sync/vX.Y.Z upstream-base/vX.Y.Z
   git switch -c downstream/vX.Y.Z <sync commit from the pull request>
   agent-git rebase --force-rebase <upstream vX.Y.Z commit>
   git diff --exit-code <sync commit from the pull request> downstream/vX.Y.Z
   git log --format='%h %G? %s' <upstream vX.Y.Z commit>..downstream/vX.Y.Z
   ```

   The diff must be empty and every commit must show `G`. Also confirm that `server/src` and `e2e/src/specs/server` are identical to upstream `vX.Y.Z`, and run the publication checks.

5. **Push only that branch and run remote CI.** `agent-git push git@github.com:<owner>/<repository>.git refs/heads/downstream/vX.Y.Z:refs/heads/downstream/vX.Y.Z`. Wait until `Downstream stack selection` succeeds with `headSha` equal to the pushed commit.
6. **Sign and push the tag.** `agent-git tag -s dkn-vX.Y.Z-1` on that commit, with the upstream base and downstream commit range in the annotation, then push only `refs/tags/dkn-vX.Y.Z-1`.
7. **Verify the release run.** Check that every job succeeded, record the image digest, check the CycloneDX SBOM artifact, confirm "Findings not present upstream: 0", and verify the keyless signature and provenance:

   ```bash
   cosign verify ghcr.io/<owner>/immich-server@<digest> \
     --certificate-identity https://github.com/<owner>/<repository>/.github/workflows/dkn-release.yml@refs/tags/dkn-vX.Y.Z-1 \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com
   gh attestation verify oci://ghcr.io/<owner>/immich-server@<digest> -R <owner>/<repository>
   ```

8. **Create the GitHub release** for `dkn-vX.Y.Z-1` with the digest, the source commit URL, the verification commands, the scan result, and the previous verified digest for rollback. Then make `downstream/vX.Y.Z` the default branch and close the review pull request.

## Images, rollback, and source availability

The release workflow accepts only downstream tags named `dkn-vX.Y.Z` (with an optional prerelease suffix) and publishes `ghcr.io/<repository-owner>/immich-server:dkn-vX.Y.Z`. Deploy by digest after verification. To roll back, redeploy the previously verified image digest and follow the upstream release compatibility and database-backup guidance for the target version.

Before making a downstream image available, publish the corresponding complete source at the same tag or commit. Release builds pass that exact commit URL as `BUILD_SOURCE_URL`, which is baked into the web application for the unauthenticated login and shared-link pages. Authenticated Help continues to read `IMMICH_THIRD_PARTY_SOURCE_URL` from the server about response, so deployments must set it to the same published source URL. The image is AGPL-3.0-only; make the corresponding source available for every distributed version.

## Decisions

### Vulnerability rule

A release may not add HIGH or CRITICAL findings beyond the official `immich-server` image of the same upstream version. Inherited findings are listed in the review pull request and the release evidence but do not block a release.

Dependency and base-image vulnerabilities are inherited from upstream and are not patched here, so the downstream stays a minimal web patch that transplants cleanly onto new upstream releases. `dkn-release.yml` enforces the rule against the official image pinned in `UPSTREAM_IMAGE`, and the upstream sync pins the new official image when it prepares a candidate.

## Release checklist

- Confirm the upstream base, the downstream commit range, and the default-off behavior.
- Confirm the review pull request shows passing validation and no findings added beyond the official image.
- Confirm every commit on `downstream/vX.Y.Z` is signed and its tree equals the reviewed `sync/vX.Y.Z` commit.
- Verify the release run digest, CycloneDX SBOM, vulnerability comparison, keyless signature, and provenance.
- Verify the baked `BUILD_SOURCE_URL` and runtime `IMMICH_THIRD_PARTY_SOURCE_URL` point to the matching public source before serving users.
- Publish only the `immich-server` image under the downstream tag convention and retain the previous verified digest.
