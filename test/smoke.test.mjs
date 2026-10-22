import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

test('package.json is valid and carries the expected identity', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
  assert.equal(typeof pkg.name, 'string')
  assert.ok(pkg.name.length > 0, 'publishable package needs a name')
  assert.match(pkg.version, /^\d+\.\d+\.\d+(-.+)?$/, 'semver version expected')
  assert.equal(typeof pkg.main, 'string')
})

test('declared entry points exist', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
  const mainPath = join(root, pkg.main)
  assert.ok(existsSync(mainPath), `main entry missing: ${pkg.main}`)
  // client entry is the browser half every companion ships
  assert.ok(existsSync(join(root, 'lib', 'client.js')), 'lib/client.js missing')
  // the cordis bundle layer is required for the host half to load
  assert.ok(existsSync(join(root, 'cordis.patch.yml')), 'cordis.patch.yml missing')
})

test('publish and build scripts are wired for pnpm CI', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
  assert.equal(typeof pkg.scripts?.build, 'string')
  assert.equal(typeof pkg.scripts?.typecheck, 'string')
  assert.equal(typeof pkg.scripts?.test, 'string')
})
