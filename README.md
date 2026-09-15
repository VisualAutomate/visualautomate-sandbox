# VisualAutomate plugin sandbox

The sandbox VisualAutomate runs plugins in, as a Docker image you can run on your own
machine.

```bash
npm install -g @visualautomate/cli
va test --docker
```

`ghcr.io/visualautomate/plugin-sandbox` contains:

- **Node 20.20.2**, the version the platform runs plugin code on;
- **every npm package a plugin may `require`**, at the versions the platform has, so a
  plugin that uses `lodash` or `dayjs` runs without `npm install` — and one that depends
  on something only your machine has stops working here too;
- **`@visualautomate/cli`**, which runs the plugin the way the platform does: the same code
  checks, the same `require`, the same egress rule for `fetch`.

`va test --docker` starts it with the limits of a sandbox tier:

| Tier | CPU | Memory |
|---|---|---|
| `standard` (default) | ¼ vCPU | 1 GB |
| `boosted` | ½ vCPU | 4 GB |
| `high` | 1 vCPU | 6 GB |
| `max` | 2 vCPU | 8 GB |

```bash
va test --docker --tier boosted
va dev --docker                  # again on every save
```

The container runs as a non-root user with no Linux capabilities, a read-only filesystem
apart from your project (mounted at `/work`) and a small `/tmp`, and nothing else from your
machine. A step that runs out of memory is stopped, as it would be on the platform.

The image tag is the CLI version: CLI 0.4.0 runs `plugin-sandbox:0.4.0`.

## Without the CLI

```bash
docker run --rm -v "$PWD:/work" --cpus 0.25 --memory 1g ghcr.io/visualautomate/plugin-sandbox:0.4.0 test
```

The entrypoint is `va`, so anything after the image name is a `va` command.

## VS Code

Copy [`devcontainer/devcontainer.json`](devcontainer/devcontainer.json) to
`.devcontainer/devcontainer.json` in your plugin's repository and choose **Reopen in
Container**. You work inside the image, with `va` on the PATH. Tier limits do not apply
there, because VS Code runs in the same container; use `va test --docker` for those.

## Not available locally

- `context.media` — ffmpeg runs on the platform, in a container of its own.
- `context.connections` — they are accounts somebody connected on the platform.

A step that asks for either fails with a message saying so.

## Building the image

Requires Docker and Node 20 or newer.

```bash
npm install
npm run generate        # image/package.json and its lockfile, from @visualautomate/plugin-sdk
npm run build -- --cli 0.4.0
npm run smoke           # real plugins through `va test --docker` against the image
```

`npm run generate` takes the list of allowed packages from the version of
`@visualautomate/plugin-sdk` in `package.json`. Bump that when a new SDK release changes
the list, run it, and rebuild.

To test a CLI that is not published yet, pack it and build from the tarball:

```bash
npm run build -- --cli-tarball ../visualautomate-sdk/visualautomate-cli-0.4.0.tgz
VA_CLI=../visualautomate-sdk/packages/cli/dist/index.js npm run smoke
```

## Publishing

After the CLI version is on npm, on GitHub: **Actions → Release image → Run workflow**, and
enter the CLI version. It builds from the published CLI, runs the smoke test against the
image and pushes `:<version>` and `:latest` to ghcr.io, logging in with the workflow's own
token.

From your own machine instead, after `docker login ghcr.io` with a classic token that has
`write:packages`:

```bash
npm run release -- --cli 0.4.0
```

Make the package public once, under the account's **Packages** settings on GitHub, so
`docker pull` works without logging in.

## License

MIT
