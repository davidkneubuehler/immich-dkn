# syntax=docker/dockerfile:1

# The official immich-server image of the upstream release, preferably by digest.
ARG UPSTREAM_IMAGE

# The named context "web" is upstream's own server/Dockerfile stage "web", built
# from the upstream tag with patches/ applied (see docker-bake.hcl). It uses the
# same Node, pnpm and lockfile as the official image.
FROM ${UPSTREAM_IMAGE}

RUN rm -rf /build/www
COPY --from=web /usr/src/app/web/build /build/www

ARG BUILD_ID
ARG BUILD_URL
ARG BUILD_IMAGE
ARG BUILD_IMAGE_URL
ARG REPOSITORY
ARG REPOSITORY_URL
ARG SOURCE_REF
ARG SOURCE_COMMIT
ARG SOURCE_URL

# The server reports these in its about information; they point at this
# repository so the source offered matches the patched web app.
ENV IMMICH_BUILD=${BUILD_ID} \
  IMMICH_BUILD_URL=${BUILD_URL} \
  IMMICH_BUILD_IMAGE=${BUILD_IMAGE} \
  IMMICH_BUILD_IMAGE_URL=${BUILD_IMAGE_URL} \
  IMMICH_REPOSITORY=${REPOSITORY} \
  IMMICH_REPOSITORY_URL=${REPOSITORY_URL} \
  IMMICH_SOURCE_REF=${SOURCE_REF} \
  IMMICH_SOURCE_COMMIT=${SOURCE_COMMIT} \
  IMMICH_SOURCE_URL=${SOURCE_URL}
