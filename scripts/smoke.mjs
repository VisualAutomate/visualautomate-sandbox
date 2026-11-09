/**
 * Run real plugins through `va test --docker` against the image, and check the
 * image behaves like the platform's sandbox.
 *
 *     npm run smoke                        the image at the CLI's version
 *     npm run smoke -- --image <ref>       another image
 *
 * Uses the `va` on this machine, the way an author would: VA_CLI points at its
 * dist/index.js, or `va` is found on PATH.
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const argv = process.argv.slice(2)
const imageFlag = argv.includes("--image") ? ["--image", argv[argv.indexOf("--image") + 1]] : []

function va(cwd, ...args) {
    const command = process.env.VA_CLI ? [process.execPath, [process.env.VA_CLI, ...args]] : ["va", args]
    const run = spawnSync(command[0], command[1], { cwd, encoding: "utf8", shell: !process.env.VA_CLI && process.platform === "win32" })
    return { code: run.status, out: `${run.stdout ?? ""}${run.stderr ?? ""}` }
}

function project(files) {
    const dir = mkdtempSync(join(tmpdir(), "va-smoke-"))
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(join(dir, path, ".."), { recursive: true })
        writeFileSync(join(dir, path), typeof text === "string" ? text : JSON.stringify(text))
    }
    return dir
}

const plugin = (body) => ({
    "manifest.json": { description: "smoke", outputs: ["success", "error"] },
    "index.js": `module.exports = { execute: async (input, config, context) => { ${body} } }\n`,
    "visualautomate.test.json": { config: {}, input: {}, expectOutput: "success" },
})

const checks = []
function check(name, files, args, expect) {
    checks.push({ name, files, args, expect })
}

check(
    // A step cannot read process.version: the platform hands it no process. What
    // runs it can, and the CLI inside the image says nothing about the Node it is
    // on only when it is the platform's.
    "runs on the platform's Node version",
    plugin(`return { output: "success", data: {} }`),
    [],
    ({ code, out }) => code === 0 && !/the platform runs steps on Node/.test(out),
)
check(
    "a step sees the platform's globals and not Node's",
    plugin(`return { output: "success", data: { buffer: typeof Buffer, process: typeof process, fetch: typeof fetch, debug: typeof console.debug } }`),
    [],
    ({ code, out }) =>
        code === 0 && /"buffer": "undefined"/.test(out) && /"process": "undefined"/.test(out)
        && /"fetch": "function"/.test(out) && /"debug": "undefined"/.test(out),
)
check(
    "an allowed package works without npm install",
    plugin(`const _ = require("lodash"); return { output: "success", data: { sum: _.sum([1, 2, 3]) } }`),
    [],
    ({ code, out }) => code === 0 && /"sum": 6/.test(out),
)
check(
    "a package that is not allowed is refused",
    plugin(`const fs = require("fs"); return { output: "success" }`),
    [],
    ({ code, out }) => code !== 0 && /requires "fs" which is not an allowed package/.test(out),
)
// Five gigabytes: more than standard's four, less than boosted's six.
const fiveGigabytes = `const blocks = []; for (let i = 0; i < 40; i++) { const b = new Uint8Array(128 * 1024 * 1024); b.fill(1); blocks.push(b) }`
check(
    "the standard tier stops a step using more than 4 GB",
    plugin(`${fiveGigabytes} return { output: "success" }`),
    [],
    ({ code }) => code !== 0,
)
check(
    "the boosted tier has room for the same step",
    plugin(`${fiveGigabytes} return { output: "success", data: { mb: blocks.length * 128 } }`),
    ["--tier", "boosted"],
    ({ code, out }) => code === 0 && /"mb": 5120/.test(out),
)
check(
    "a declared module is checked, not run",
    {
        "manifest.json": {
            description: "List repositories",
            properties: { account: { label: "Account", type: "connection" } },
            outputs: ["success", "error"],
            action: { connection: "account", request: { method: "GET", path: "user/repos" }, outputs: { count: "{{response | length}}" } },
        },
    },
    [],
    ({ code, out }) => code === 0 && /checked/.test(out),
)
check(
    "--persist writes storage into the project on this machine",
    plugin(`await context.storage.put("out/hello.txt", "from the container"); return { output: "success" }`),
    ["--persist"],
    ({ code }, dir) => code === 0 && readFileSync(join(dir, ".visualautomate/storage/out/hello.txt"), "utf8") === "from the container",
)
check(
    "every module of an app repository runs",
    {
        "modules/a/manifest.json": { description: "a", outputs: ["success"] },
        "modules/a/index.js": `module.exports = { execute: async () => ({ output: "success" }) }\n`,
        "modules/b/manifest.json": { description: "b", outputs: ["success"] },
        "modules/b/index.js": `module.exports = { execute: async () => ({ output: "success" }) }\n`,
    },
    [],
    ({ code, out }) => code === 0 && /2 of 2 passed/.test(out),
)

let failed = 0
for (const { name, files, args, expect } of checks) {
    const dir = project(files)
    const started = Date.now()
    const result = va(dir, "test", "--docker", ...imageFlag, ...args)
    let passed = false
    try {
        passed = expect(result, dir)
    } catch {
        passed = false
    }
    console.log(`${passed ? "✓" : "✗"} ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`)
    if (!passed) {
        failed++
        console.log(result.out.replace(/^/gm, "    "))
    }
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

console.log(`\n${checks.length - failed} of ${checks.length} passed`)
process.exit(failed ? 1 : 0)
