# VisualAutomate plugin sandbox

The sandbox VisualAutomate runs plugins in, as a Docker image you can run on your own
machine.

```bash
npm install -g @visualautomate/cli
va test --docker
```

`ghcr.io/visualautomate/plugin-sandbox` contains:

- **Node 24** (24.22.2), the version the platform runs plugin code on;
- **every npm package a plugin may `require`**, at the versions the platform has and with
  its npm overrides, so a plugin that uses `lodash` or `dayjs` runs without `npm install`
  — and one that depends on something only your machine has stops working here too;
- **`@visualautomate/cli`**, which runs the plugin the way the platform does: the same
  manifest and code checks, the same `require`, the runner's globals and nothing else, the
  same egress rule for `fetch`.

`va test --docker` starts it with the limits of a sandbox tier:

| Tier | CPU | Memory |
|---|---|---|
| `standard` (default) | ½ vCPU | 4 GB |
| `boosted` | 1 vCPU | 6 GB |
| `high` | 2 vCPU | 8 GB |

These are the platform's machines. `max` is no longer offered there, and runs as `high`.

```bash
va test --docker --tier boosted
va dev                           # in this image, again on every save
```

The container runs as a non-root user with no Linux capabilities, a read-only filesystem
apart from your project (mounted at `/work`) and a small `/tmp`, and nothing else from your
machine. A step that runs out of memory is stopped, as it would be on the platform.

The image tag is the CLI version: CLI 0.8.0 runs `plugin-sandbox:0.8.0`.

## Without the CLI

```bash
docker run --rm -v "$PWD:/work" --cpus 0.5 --memory 4g ghcr.io/visualautomate/plugin-sandbox:0.8.0 test
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

`context.connections` is absent, as on the platform when no account was chosen;
`context.media` fails with a message saying so.

## Building the image

Requires Docker and Node 20 or newer.

```bash
npm install
npm run generate        # image/package.json and its lockfile, from @visualautomate/plugin-sdk
npm run build -- --cli 0.8.0
npm run smoke           # real plugins through `va test --docker` against the image
```

`npm run generate` takes the list of allowed packages, their versions and the npm
overrides from the version of `@visualautomate/plugin-sdk` in `package.json`. Bump that
when a new SDK release changes them, run it, and rebuild. The SDK takes them from the
platform (`npm run platform:sync` there), so the order is: SDK release, then this image at
the same version.

The lockfile is made by a real `npm install` in a `node` container. Where containers cannot
reach the registry (behind a proxy they are not given), `node scripts/generate-packages.mjs
--host` runs that install with this machine's npm instead; every package is plain
JavaScript, so the tree is the same.

To test a CLI that is not published yet, pack it and build from the tarball:

```bash
npm run build -- --cli-tarball ../visualautomate-sdk/visualautomate-cli-0.8.0.tgz
VA_CLI=../visualautomate-sdk/packages/cli/dist/index.js npm run smoke
```

## License

MIT
