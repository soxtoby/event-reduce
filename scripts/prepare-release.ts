import { $ } from "bun"
import { join } from "path"

/** Every package is released at the same version. */
let packageDirs = ["packages/event-reduce", "packages/event-reduce-react"]
/** The version part each kind of change bumps: 0 for major, 1 for minor, 2 for patch. */
let bumpedPart: Record<string, number> = { Breaking: 0, Added: 1, Changed: 1, Fixed: 2 }

process.chdir(join(import.meta.dir, ".."))

let changelog = await Bun.file("CHANGELOG.md").text()
let unreleased = /^## Unreleased$([\s\S]*?)^## /m.exec(changelog)?.[1] ?? ""
let headings = [...unreleased.matchAll(/^### (.*)$/gm)].map(match => match[1]!)
if (!headings.length)
    throw new Error("CHANGELOG.md has no changes under Unreleased.")
let unknown = headings.filter(heading => !Object.hasOwn(bumpedPart, heading))
if (unknown.length)
    throw new Error(`Unknown change headings under Unreleased: ${unknown.join(", ")}.`)

let { version } = await Bun.file(join(packageDirs[0]!, "package.json")).json()
let next = nextVersion(version, Math.min(...headings.map(heading => bumpedPart[heading]!)))

for (let dir of packageDirs)
    await $`bun pm version ${next} --no-git-tag-version`.cwd(dir).quiet()
await $`bun install --lockfile-only`.quiet() // bun.lock records workspace versions
// The Unreleased notes become the new version's notes
await Bun.write("CHANGELOG.md", changelog.replace(/^## Unreleased(\r?\n)/m, `$&$1## v${next}$1`))

console.log(`Prepared v${next}. Commit it, then tag the commit v${next} and push the tag to publish it.`)

function nextVersion(version: string, part: number) {
    let parts = version.split(".").map(Number)
    if (parts[0] == 0) // Below 1.0, npm's caret ranges treat a new minor version as breaking, so each bump moves down a part
        part = Math.min(part + 1, 2)
    parts[part]!++
    return parts.fill(0, part + 1).join(".")
}
