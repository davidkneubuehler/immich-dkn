# Downstream maintenance and release guide

This repository is an unofficial, publicly available downstream of Immich. Each branch `downstream/vX.Y.Z` carries the downstream patch on upstream tag `vX.Y.Z`, and each GitHub release `dkn-vX.Y.Z-N` publishes one of them. It is not supported by the Immich project.

## Included change

The web application adds an opt-in whole-stack selection toggle. It is off by default, preserving upstream primary-asset selection. When enabled, a selection operation expands a selected stack primary to its members before bulk actions run. The server image contains this web patch. Mobile and machine-learning artifacts are upstream artifacts.

## Upstream release tracking

`.github/workflows/dkn-upstream-sync.yml` runs daily and on manual dispatch. Nobody needs to check upstream by hand, and a clean upstream release is published without human steps.

1. It finds the highest published, non-prerelease release of `immich-app/immich`. The current base is the upstream version named by the highest published, non-prerelease `dkn-vX.Y.Z-N` release of this repository, and the source is its branch `downstream/vX.Y.Z`. The default branch name plays no part and the workflow never changes the default branch.
2. If that release is not newer than the base, if `sync/vX.Y.Z` or `downstream/vX.Y.Z` already exists, or if the official `immich-server` image for the release is not published yet, it stops without changing anything.
3. Otherwise it cherry-picks the downstream commits (base tag..`downstream/<base>`) onto the upstream tag. It adds no commits of its own: `GITHUB_TOKEN` cannot push new workflow file content.
4. On a conflict it aborts, creates no branches, and fails the run. The run summary lists the conflicting commit, the conflicting files, and the commits applied and not applied.
5. Without a conflict it pushes the candidate as `sync/vX.Y.Z`, runs `dkn-stack-selection.yml` against it, builds the production `immich-server` image for linux/amd64 without pushing it, and compares its fixable HIGH and CRITICAL findings with the official image of the same upstream version. A failed image build is retried once and the official image pull up to five times, because registry and GitHub API rate limits on shared runners are common; the release run does the same.
6. **Clean path.** If validation passes and the comparison adds no findings, it creates `downstream/vX.Y.Z` at the validated candidate commit and the annotated tag `dkn-vX.Y.Z-1` (upstream base and downstream commit range in the annotation), then calls `dkn-release.yml` in the same run. Tags created with `GITHUB_TOKEN` start no workflows, so the call replaces the tag-push trigger. The release run checks that the tag points at the candidate and contains upstream `vX.Y.Z`, builds and pushes the multi-architecture image, generates the CycloneDX SBOM, repeats the scan comparison as a gate, signs the image keylessly, attests provenance, and creates the GitHub release with the digest, source commit, verification commands, scan result, advisories, transplanted commits, and the previous verified digest. The evidence files are attached to the release. No pull request is opened.
7. **Validation or comparison failed.** It creates `upstream-base/vX.Y.Z` at the upstream tag and opens a pull request from `sync/vX.Y.Z` into it, so the diff is exactly the downstream patch, and requests a review from the repository owner. The body links the upstream release notes, lists security advisories published since the previous base or referenced in the release notes, and includes the validation results and the scanner comparison. The run fails. An existing `upstream-base/vX.Y.Z` is reused, or reset to the upstream tag if it points elsewhere.

Automation never approves or merges pull requests. The commits on an automatically created `downstream/vX.Y.Z` are the unsigned cherry-picks from `sync/vX.Y.Z`; the tag is unsigned too. Their integrity rests on the protected refs, the validated candidate commit, and the keyless image signature and provenance, which name the workflow run. A review pull request is closed, not merged, after the release. Pull requests into `upstream-base/*` do not trigger `dkn-stack-selection.yml`, because the sync run already validates the exact candidate commit.

A real run must start from a `downstream/vX.Y.Z` branch. The workflow runs with `GITHUB_TOKEN` only. No step needs a personal login, agent-git, or a stored secret.

### Where the automation runs from

Scheduled runs, and dispatched runs without another ref, use the workflow files on the default branch, including the called `dkn-release.yml` and `dkn-stack-selection.yml`. An automatic release is therefore signed by `https://github.com/<owner>/<repository>/.github/workflows/dkn-release.yml@refs/heads/<default branch>`; a manual tag push is signed by the same file `@refs/tags/dkn-vX.Y.Z-N`. The release body states the exact identity.

Changes to the downstream patch belong on the latest `downstream/vX.Y.Z`, which is the next transplant source. Changes to the automation take effect only once they are on the default branch; when the default branch is not the latest release branch, commit them to both.

### Recovering a failed clean-path run

If the run fails after `sync/vX.Y.Z` exists (release refs, image push, signing, or release creation), later scheduled runs skip that version. Use **Re-run failed jobs** on the same run: branch and tag creation accept refs that already point at the candidate, and release creation stops if the GitHub release already exists. If the candidate itself must change, continue with the manual release flow.

### Rehearsals

To test the flow without publishing, push a `dkn-test/<name>` branch whose downstream commits sit on an older upstream release, and dispatch the workflow from that branch so its workflow files run:

```bash
gh workflow run dkn-upstream-sync.yml -R <owner>/<repository> --ref dkn-test/<name> \
  -f source_branch=dkn-test/<name> -f base_tag=vA.B.C -f upstream_tag=vX.Y.Z
```

A rehearsal runs the same jobs with these differences: candidate branches are named `dkn-test/<name>-sync-vX.Y.Z`, `dkn-test/<name>-upstream-base-vX.Y.Z`, and `dkn-test/<name>-downstream-vX.Y.Z`; no tag is created; and `dkn-release.yml` runs with `publish: false`, so it checks the upstream ancestry, builds linux/amd64 into the runner's Docker daemon only, generates the SBOM, runs the scan gate, uploads the evidence artifact, and writes the would-be release body to the job summary. Nothing is pushed to the registry, signed, attested, or released. `base_tag` and `upstream_tag` are accepted only with a `dkn-test/*` source; an explicit `upstream_tag` skips the "newer release" check. Delete the `dkn-test/*` branches afterwards.

### Notifications

| Situation | What happens | Notification |
| --- | --- | --- |
| No newer upstream release, or a candidate already exists | The run succeeds and does nothing. | None. |
| Clean transplant, validation passed, no findings added | `sync/vX.Y.Z`, `downstream/vX.Y.Z`, and `dkn-vX.Y.Z-1` are created and the release is published in the same run. | Published release (release notification for watchers of this repository). If a publishing step fails, a failed-run notification instead. |
| Clean transplant, validation or scan comparison failed | Branches and a review pull request are created, and the run fails. | Pull request review request from `github-actions` and a failed-run notification. |
| Conflict | The run fails with a conflict summary. It fails again on every daily run until `downstream/vX.Y.Z` exists. | Failed-run notification for `Downstream upstream sync`. |

GitHub sends scheduled-run notifications to the user who last modified the cron line in the workflow file. Keep standard Actions failure notifications enabled, and watch releases of this repository to be told about automatic releases.

### Scheduled workflow inactivity limit

GitHub disables scheduled workflows in public repositories after 60 days without repository activity. GitHub does not document what counts as activity, whether re-enabling a workflow resets the period, or whether it warns before disabling. No reliable mechanism without commits is documented.

The workflow therefore does two best-effort things on every run, without committing to `downstream/*`:

- it calls the enable-workflow API for itself;
- when the repository has had no push for 45 days, it recreates the `dkn-keepalive` branch at the default branch head and checks that the repository's last-push time moved. If it did not, the run fails, which is a notification at least 15 days before the limit.

Upstream releases also create branches, and every downstream release pushes a branch and a tag, which are normal repository activity. If the workflow is ever shown as disabled, re-enable it with `gh workflow enable dkn-upstream-sync.yml` and dispatch it once.

## Manual release flow

Use this flow when the upstream sync did not publish a release: a conflict, failed validation, findings added beyond the official image, or a candidate that needs changes.

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
7. **Verify the release run.** The run fails unless the tagged commit contains the upstream `vX.Y.Z` commit named by the tag. Check that every job succeeded, record the image digest, check that the upstream baseline image and digest in the job summary and the `immich-upstream.image` evidence belong to upstream `vX.Y.Z`, check the CycloneDX SBOM artifact, confirm "Findings not present upstream: 0", and verify the keyless signature and provenance:

   ```bash
   cosign verify ghcr.io/<owner>/immich-server@<digest> \
     --certificate-identity https://github.com/<owner>/<repository>/.github/workflows/dkn-release.yml@refs/tags/dkn-vX.Y.Z-1 \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com
   gh attestation verify oci://ghcr.io/<owner>/immich-server@<digest> -R <owner>/<repository>
   ```

8. **Create the GitHub release** for `dkn-vX.Y.Z-1` with the digest, the source commit URL, the verification commands, the scan result, and the previous verified digest for rollback, and publish it as a non-prerelease: the next upstream sync takes its base from the latest such release. Close the review pull request. Do not change the default branch.

## Images, rollback, and source availability

The release workflow accepts only downstream tags named `dkn-vX.Y.Z` (with an optional prerelease suffix), fails when the tagged commit does not contain the upstream `vX.Y.Z` commit (`git merge-base --is-ancestor`), and publishes `ghcr.io/<repository-owner>/immich-server:dkn-vX.Y.Z`. Deploy by digest after verification. To roll back, redeploy the previously verified image digest and follow the upstream release compatibility and database-backup guidance for the target version.

Before making a downstream image available, publish the corresponding complete source at the same tag or commit. Release builds pass that exact commit URL as `BUILD_SOURCE_URL`, which is baked into the web application for the unauthenticated login and shared-link pages. Authenticated Help continues to read `IMMICH_THIRD_PARTY_SOURCE_URL` from the server about response, so deployments must set it to the same published source URL. The image is AGPL-3.0-only; make the corresponding source available for every distributed version.

## Decisions

### Vulnerability rule

A release may not add HIGH or CRITICAL findings beyond the official `immich-server` image of the same upstream version. Inherited findings are listed in the review pull request and the release evidence but do not block a release.

Dependency and base-image vulnerabilities are inherited from upstream and are not patched here, so the downstream stays a minimal web patch that transplants cleanly onto new upstream releases. `dkn-release.yml` enforces the rule: it derives the upstream version from the release tag (`dkn-vX.Y.Z-N` becomes `vX.Y.Z`), resolves the digest of `ghcr.io/immich-app/immich-server:vX.Y.Z` during the run, fails if the digest cannot be resolved, scans against that digest, and records the resolved image and digest in the job summary and the release evidence. The upstream sync applies the same comparison to each candidate before review.

## Release checklist

- Confirm the upstream base, the downstream commit range, and the default-off behavior.
- For a manual release, confirm the review pull request shows passing validation and no findings added beyond the official image, and that every commit on `downstream/vX.Y.Z` is signed and its tree equals the reviewed `sync/vX.Y.Z` commit.
- For an automatic release, confirm the release body and the sync run summary show passing validation, 0 added findings, and `downstream/vX.Y.Z`, `sync/vX.Y.Z`, and `dkn-vX.Y.Z-1` at the same commit.
- Verify the release run digest, CycloneDX SBOM, vulnerability comparison, keyless signature, and provenance.
- Verify the baked `BUILD_SOURCE_URL` and runtime `IMMICH_THIRD_PARTY_SOURCE_URL` point to the matching public source before serving users.
- Publish only the `immich-server` image under the downstream tag convention and retain the previous verified digest.
