# syntax=docker/dockerfile:1

# The VisualAutomate plugin sandbox, for running plugins on your own machine.
#
# What a plugin meets on the platform: the same Node version, every npm package
# a plugin may require at the same versions, and nothing else. The CLI inside
# runs the plugin the way the platform does; `va test --docker` starts this image
# with the CPU and memory of a sandbox tier and a read-only filesystem.

# The Node version the platform's sandbox runs plugins on. Plugin code runs in
# the same process as the CLI, so this is the version the code is tested on.
ARG NODE_VERSION=20.20.2
FROM node:${NODE_VERSION}-bookworm-slim

LABEL org.opencontainers.image.title="VisualAutomate plugin sandbox" \
      org.opencontainers.image.description="Run VisualAutomate plugins locally, the way the platform runs them." \
      org.opencontainers.image.source="https://github.com/VisualAutomate/visualautomate-sandbox" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    VISUALAUTOMATE_PACKAGES=/opt/visualautomate

# Every package a plugin may require, at the versions in the lockfile, with no
# install scripts.
#
# `npm install`, not `npm ci`: two allowed packages disagree about `buffer` (crc
# wants 6 as a peer, bl needs 5), which npm installs with a warning and `npm ci`
# refuses outright. The platform installs the same list with `npm install` too.
WORKDIR /opt/visualautomate
COPY image/package.json image/package-lock.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --loglevel=error \
    && npm cache clean --force

# The CLI: from npm by default, or from a tarball in vendor/ when building a
# version that is not published yet.
ARG CLI_PACKAGE=@visualautomate/cli
COPY vendor/ /tmp/vendor/
RUN npm install --global --no-audit "${CLI_PACKAGE}" \
    && npm cache clean --force \
    && rm -rf /tmp/vendor \
    && va --version

# Not root. The project is mounted at /work.
USER node
WORKDIR /work

ENTRYPOINT ["va"]
CMD ["--help"]
