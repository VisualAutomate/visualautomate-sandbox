/**
 * Run a program without a shell.
 *
 * Not `npm.cmd` through `shell: true`: on Windows a shell splits every path that
 * has a space in it. npm is run as its own JavaScript file with this Node, and
 * docker is an .exe that needs no shell at all.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const NPM_CLI = [
    process.env.npm_execpath,
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
].find((path) => path && path.endsWith(".js") && existsSync(path))

export function npm(args, cwd) {
    if (!NPM_CLI) throw new Error("Could not find npm next to this Node.")
    const dir = cwd instanceof URL ? fileURLToPath(cwd) : cwd
    return execFileSync(process.execPath, [NPM_CLI, ...args], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
}

/** Run docker with the output shown. Returns the exit code. */
export function docker(args, options = {}) {
    const result = spawnSync("docker", args, { stdio: "inherit", ...options })
    if (result.error) throw new Error("Docker is not installed, or not on PATH.")
    return result.status ?? 1
}

/** Run docker and capture what it prints. */
export function dockerOutput(args, options = {}) {
    const result = spawnSync("docker", args, { encoding: "utf8", ...options })
    if (result.error) throw new Error("Docker is not installed, or not on PATH.")
    return { code: result.status ?? 1, out: `${result.stdout ?? ""}${result.stderr ?? ""}` }
}
