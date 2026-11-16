// detail-locale-live.test.mjs — live locale/detail resolution across the dsh-flash family
//
// This is a SELF-CONTAINED, REUSABLE test. It does not mock anything: it drives DSH's real
// `@deepseek-ai/dsh-plugin-detail` library against the real sibling repositories on disk and
// asserts the detail document each one *should* resolve to for a language chain.
//
// Configuration (all optional, so the file is safe to leave in `pnpm run test` on any machine):
//   DSH_REPOS_ROOT         where the family repos and the DSH checkout live.
//                          Default: the parent of this test file (this repo's own directory's
//                          parent) — i.e. dsh-flash lives directly inside the family root.
//   DSH_PLUGIN_DETAIL_LIB  absolute path to the plugin-detail `lib/index.js` to import.
//                          Default: `<DSH_REPOS_ROOT>/deepseek-harness/packages/util/plugin-detail/lib/index.js`.
//   DSH_FLASH_FAMILY       whitespace-separated repo names to check, relative to DSH_REPOS_ROOT.
//                          Default: the six dsh-flash-family repos.
//
// Degradation contract: if the lib file, or any one repo directory, is not present the affected
// tests are SKIPPED, never failed — a CI box without the DSH checkout still goes green. Every
// assertion runs only against repositories that actually exist.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, posix } from "node:path";

// ── resolution of the live inputs ──────────────────────────────────────────────────────────────

// This test file lives at <familyRoot>/dsh-flash/test/, so its grandparent is the family root.
const here = dirname(fileURLToPath(import.meta.url));
const defaultFamilyRoot = dirname(dirname(here));
const familyRoot = process.env.DSH_REPOS_ROOT || defaultFamilyRoot;

const defaultLib = join(familyRoot, "deepseek-harness", "packages", "util", "plugin-detail", "lib", "index.js");
const libPath = process.env.DSH_PLUGIN_DETAIL_LIB || defaultLib;

const DEFAULT_FAMILY = ["dsh-flash", "dsh-flash-ctx-mon", "dsh-flash-mem-mon", "dsh-flash-net-mon", "dsh-flash-proxy", "dsh-flash-skin"];
const family =
	process.env.DSH_FLASH_FAMILY
		? process.env.DSH_FLASH_FAMILY.split(/\s+/).filter(Boolean)
		: DEFAULT_FAMILY;

// Expected (origin, path) each repo must resolve to for a display language. The dsh-flash family
// leads with a zh-CN README; dsh-flash-skin is the deliberate exception — "纯英文插件", it ships no
// zh README and declares no `meta.detail`, so both chains fall back to its English README.
const EXPECTED = {
	"dsh-flash": { zh: ["locale", "README.zh-CN.md"], en: ["locale", "README.md"] },
	"dsh-flash-ctx-mon": { zh: ["locale", "README.zh-CN.md"], en: ["locale", "README.md"] },
	"dsh-flash-mem-mon": { zh: ["locale", "README.zh-CN.md"], en: ["locale", "README.md"] },
	"dsh-flash-net-mon": { zh: ["locale", "README.zh-CN.md"], en: ["locale", "README.md"] },
	"dsh-flash-proxy": { zh: ["locale", "README.zh-CN.md"], en: ["locale", "README.md"] },
	"dsh-flash-skin": { zh: ["readme", "README.md"], en: ["readme", "README.md"] },
};

const libAvailable = existsSync(libPath);
const skipReason = libAvailable
	? false
	: `DSH plugin-detail lib not found at ${libPath} (set DSH_PLUGIN_DETAIL_LIB) — skipped`;

test("detail locale resolution across the dsh-flash family", { skip: skipReason }, async (t) => {
	const mod = await import(pathToFileURL(libPath).href);
	const { localFiles, languageChain, readPackageDocument } = mod;

	const MB = 2 ** 20; // plenty for any README in the family

	for (const repo of family) {
		await t.test(repo, { skip: false }, async (t) => {
			const root = join(familyRoot, repo);
			if (!existsSync(root)) {
				t.skip(`repo directory missing: ${root}`);
				return;
			}
			const spec = EXPECTED[repo];
			if (!spec) {
				t.skip(`no expected spec registered for ${repo} — add one to EXPECTED`);
				return;
			}
			// One revision string, so a reinstalled package reads as a consistent snapshot.
			const files = localFiles(root, "HEAD");

			for (const [language, [expectedOrigin, expectedFile]] of Object.entries(spec)) {
				await t.test(`${language} → ${expectedOrigin}:${posix.join(expectedFile)}`, async () => {
					const doc = await readPackageDocument(files, "", languageChain(language), MB);
					assert.ok(doc, `${repo} resolved no detail document for chain ${languageChain(language)}`);
					assert.equal(doc.origin, expectedOrigin, `unexpected origin for ${language} (path ${doc.path})`);
					assert.equal(doc.path, expectedFile, `unexpected document path for ${language}`);
					assert.ok(
						typeof doc.markdown === "string" && doc.markdown.length > 0,
						`${doc.path} resolved to empty markdown for ${language}`
					);
					// A locale-origin README must be non-trivial prose, not a single-char stub.
					// Purposefully loose: catches a file that exists but carried no real content.
					assert.ok(doc.markdown.trim().length > 10, `${doc.path} is suspiciously short for ${language}`);
				});
			}
		});
	}
});
