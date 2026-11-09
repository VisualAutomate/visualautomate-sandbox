/**
 * Write image/package.json: every npm package a plugin may require, at the
 * version the platform's sandbox has.
 *
 *     npm run generate
 *
 * The list comes from @visualautomate/plugin-sdk, which carries the platform's
 * rules, so the image offers exactly what `validatePluginCode` accepts — a
 * package missing here would pass the check and fail at require().
 *
 * Then refreshes image/package-lock.json, so every image build installs the
 * same versions.
 */

import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { ALLOWED_PACKAGES, SANDBOX_OVERRIDES } from "@visualautomate/plugin-sdk"
import { docker, npm } from "./npm.mjs"

const sdkVersion = JSON.parse(
    readFileSync(new URL("../node_modules/@visualautomate/plugin-sdk/package.json", import.meta.url), "utf8"),
).version

const dependencies = Object.fromEntries(
    [...ALLOWED_PACKAGES].sort((a, b) => a.name.localeCompare(b.name)).map((p) => [p.name, p.version]),
)

writeFileSync(
    new URL("../image/package.json", import.meta.url),
    JSON.stringify(
        {
            name: "visualautomate-plugin-packages",
            private: true,
            description: `The packages a VisualAutomate plugin may require. Generated from @visualautomate/plugin-sdk ${sdkVersion}; do not edit.`,
            dependencies,
            // The platform installs the same list with these, so a package one of
            // them pulls in is the version it has there too.
            overrides: SANDBOX_OVERRIDES ?? {},
        },
        null,
        2,
    ) + "\n",
)

// The lockfile is written by the npm inside the image's Node, not this machine's:
// npm versions resolve the same ranges into different trees, and `npm ci` in
// the build refuses a lockfile its own npm would not have written.
//
// No install scripts, here or in the image: allowed packages have none, and one
// that grew one would run it while the image is built.
const nodeVersion = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8").match(/ARG NODE_VERSION=([\d.]+)/)[1]
const imageDir = fileURLToPath(new URL("../image/", import.meta.url))

// A real install in a scratch folder, and only its lockfile copied back:
// --package-lock-only writes a tree that `npm ci` then rejects when one package
// is both a direct dependency and a nested one at another version.
const install = "npm install --ignore-scripts --no-audit --no-fund --loglevel=error"

let code
if (process.argv.includes("--host")) {
    // On this machine's npm rather than in a container: for when containers
    // cannot reach the registry (behind a proxy they are not given). Every package
    // here is plain JavaScript, so the tree npm resolves does not depend on the
    // Node version it runs on.
    const scratch = mkdtempSync(join(tmpdir(), "va-packages-"))
    try {
        copyFileSync(join(imageDir, "package.json"), join(scratch, "package.json"))
        npm(install.split(" ").slice(1), scratch)
        copyFileSync(join(scratch, "package-lock.json"), join(imageDir, "package-lock.json"))
        code = 0
    } finally {
        rmSync(scratch, { recursive: true, force: true })
    }
} else {
    code = docker(
        [
            "run", "--rm",
            "--volume", `${imageDir}:/packages`,
            "--workdir", "/packages",
            `node:${nodeVersion}-bookworm-slim`,
            "sh", "-c",
            `mkdir -p /tmp/p && cp /packages/package.json /tmp/p/ && cd /tmp/p && ${install} && cp package-lock.json /packages/package-lock.json`,
        ],
        { env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
    )
}
if (code !== 0) process.exit(code)

console.log(`${Object.keys(dependencies).length} packages from @visualautomate/plugin-sdk ${sdkVersion}`)
