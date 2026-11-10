/**
 * CI: the image is built from what the published SDK says the platform runs.
 *
 * Fails when image/package.json's packages or npm overrides differ from the
 * SDK's ALLOWED_PACKAGES and SANDBOX_OVERRIDES (run `npm run generate`), or
 * when the Dockerfile's Node major is not the platform's.
 *
 * A file rather than an inline `node -e '...'` in the workflow: one
 * apostrophe in a message ended the shell's quoting and failed the step
 * before any of it ran.
 */
import { readFileSync } from "node:fs"
import { ALLOWED_PACKAGES, PLATFORM_NODE_MAJOR, SANDBOX_OVERRIDES } from "@visualautomate/plugin-sdk"

const image = JSON.parse(readFileSync("image/package.json", "utf8"))
const committed = image.dependencies ?? {}
const wanted = Object.fromEntries(ALLOWED_PACKAGES.map((p) => [p.name, p.version]))
const differs = [...new Set([...Object.keys(committed), ...Object.keys(wanted)])].filter(
    (name) => committed[name] !== wanted[name],
)
if (differs.length) {
    console.error(`Run npm run generate. These packages differ from the SDK's list: ${differs.join(", ")}`)
    process.exit(1)
}
if (JSON.stringify(image.overrides ?? {}) !== JSON.stringify(SANDBOX_OVERRIDES ?? {})) {
    console.error("Run npm run generate. The npm overrides differ from the SDK's.")
    process.exit(1)
}
const node = Number(readFileSync("Dockerfile", "utf8").match(/ARG NODE_VERSION=(\d+)/)?.[1])
if (node !== PLATFORM_NODE_MAJOR) {
    console.error(`The Dockerfile builds on Node ${node}; the platform runs Node ${PLATFORM_NODE_MAJOR}.`)
    process.exit(1)
}
console.log(`${ALLOWED_PACKAGES.length} packages, the npm overrides and Node ${node} match the SDK.`)
