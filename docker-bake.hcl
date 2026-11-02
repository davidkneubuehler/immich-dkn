# Build with `docker buildx bake` after scripts/prepare-source.sh has prepared
# UPSTREAM_DIR. Environment variables of the same name override these values.

variable "UPSTREAM_VERSION" {
  default = ""
}

variable "UPSTREAM_DIR" {
  default = "upstream"
}

variable "UPSTREAM_IMAGE" {
  default = "ghcr.io/immich-app/immich-server:${UPSTREAM_VERSION}"
}

# Release tag of this repository, dkn-vX.Y.Z-N.
variable "RELEASE_TAG" {
  default = "dkn-${UPSTREAM_VERSION}-local"
}

variable "IMAGE" {
  default = "ghcr.io/davidkneubuehler/immich-server"
}

variable "REPOSITORY" {
  default = "davidkneubuehler/immich-dkn"
}

variable "SOURCE_COMMIT" {
  default = ""
}

variable "BUILD_ID" {
  default = ""
}

variable "BUILD_URL" {
  default = ""
}

# Comma-separated; empty builds for the local platform.
variable "PLATFORMS" {
  default = ""
}

group "default" {
  targets = ["server"]
}

# Upstream's own web stage. The static files are the same for every platform,
# so it builds once for the build host.
target "web" {
  context    = UPSTREAM_DIR
  dockerfile = "server/Dockerfile"
  target     = "web"
  args = {
    BUILD_ID = BUILD_ID
  }
}

target "server" {
  context    = "."
  dockerfile = "Dockerfile"
  contexts = {
    web = "target:web"
  }
  platforms = PLATFORMS == "" ? [] : split(",", PLATFORMS)
  args = {
    UPSTREAM_IMAGE  = UPSTREAM_IMAGE
    BUILD_ID        = BUILD_ID
    BUILD_URL       = BUILD_URL
    BUILD_IMAGE     = "${IMAGE}:${UPSTREAM_VERSION}"
    BUILD_IMAGE_URL = "https://github.com/${REPOSITORY}/pkgs/container/immich-server"
    REPOSITORY      = REPOSITORY
    REPOSITORY_URL  = "https://github.com/${REPOSITORY}"
    SOURCE_REF      = RELEASE_TAG
    SOURCE_COMMIT   = SOURCE_COMMIT
    SOURCE_URL      = "https://github.com/${REPOSITORY}/tree/${RELEASE_TAG}"
  }
  tags = [
    "${IMAGE}:${UPSTREAM_VERSION}",
    "${IMAGE}:${RELEASE_TAG}",
  ]
  labels = {
    "org.opencontainers.image.title"       = "immich-server"
    "org.opencontainers.image.description" = "Immich ${UPSTREAM_VERSION} with the web patches of ${REPOSITORY} (unofficial)"
    "org.opencontainers.image.source"      = "https://github.com/${REPOSITORY}"
    "org.opencontainers.image.url"         = "https://github.com/${REPOSITORY}"
    "org.opencontainers.image.revision"    = SOURCE_COMMIT
    "org.opencontainers.image.version"     = RELEASE_TAG
    "org.opencontainers.image.licenses"    = "AGPL-3.0-only"
    "org.opencontainers.image.base.name"   = UPSTREAM_IMAGE
  }
}
