/**
 * Build the image, tagged with the version of the CLI inside it.
 *
 *     npm run build                              the CLI version from npm, latest
 *     npm run build -- --cli 0.4.0               a published version
 *     npm run build -- --cli-tarball ../x.tgz    a CLI that is not published yet
 *     npm run release -- --cli 0.4.0             build, then push to ghcr.io
 *
 * `va test --docker` asks for the image at its own version, so the tag has to
 * be the CLI's version exactly. Pushing needs `docker login ghcr.io` first.
 */

import { copyFileSync, readdirSync, rmSync } from "node:fs"
import { basename, resolve } from "node:path"
import { docker, npm } from "./npm.mjs"

export const IMAGE = "ghcr.io/visualautomate/plugin-sandbox"

const argv = process.argv.slice(2)
const flag = (name) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
}
const push = argv.includes("--push")

const vendor = new URL("../vendor/", import.meta.url)
for (const file of readdirSync(vendor)) if (file.endsWith(".tgz")) rmSync(new URL(file, vendor))

let cliPackage
let version
const tarball = flag("cli-tarball")
if (tarball) {
    const match = basename(tarball).match(/^visualautomate-cli-(\d+\.\d+\.\d+(?:-[\w.]+)?)\.tgz$/)
    if (!match) {
        console.error(`${tarball} does not look like a CLI tarball (visualautomate-cli-<version>.tgz).`)
        process.exit(1)
    }
    version = match[1]
    copyFileSync(resolve(tarball), new URL(basename(tarball), vendor))
    cliPackage = `/tmp/vendor/${basename(tarball)}`
} else {
    version = flag("cli") ?? JSON.parse(npm(["view", "@visualautomate/cli", "version", "--json"], process.cwd()))
    cliPackage = `@visualautomate/cli@${version}`
}

if (push && tarball) {
    console.error("Refusing to push an image built from a local tarball: publish the CLI first, then build from npm.")
    process.exit(1)
}

const tags = [`${IMAGE}:${version}`, `${IMAGE}:latest`]
console.log(`Building ${tags.join(", ")} with ${cliPackage}`)

const built = docker([
    "build",
    "--build-arg", `CLI_PACKAGE=${cliPackage}`,
    ...tags.flatMap((tag) => ["--tag", tag]),
    ".",
], { cwd: new URL("..", import.meta.url) })

for (const file of readdirSync(vendor)) if (file.endsWith(".tgz")) rmSync(new URL(file, vendor))
if (built !== 0) process.exit(built)

if (push) {
    for (const tag of tags) {
        if (docker(["push", tag]) !== 0) process.exit(1)
    }
    console.log(`Pushed ${tags.join(", ")}`)
}
