/** Linux runtime preparation uses system libvips and retains only the compiled sharp addon. */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { prepareLinuxSharp } from '../scripts/linux-sharp.ts'

const state = vi.hoisted(() => ({
  version: '8.18.7', failure: undefined as Error | undefined, buildDirectory: '',
  execute: vi.fn<(
    file: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv },
  ) => Promise<{ stdout: string; stderr: string }>>(),
}))
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { promisify } = await import('node:util')
  return { ...actual, execFile: Object.assign(vi.fn(), { [promisify.custom]: state.execute }) }
})

afterEach(() => { vi.clearAllMocks() })

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'linux-sharp-test-'))
  onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const source = join(root, 'node_modules', 'sharp')
  mkdirSync(join(source, 'dist'), { recursive: true })
  mkdirSync(join(source, 'src'))
  writeFileSync(join(source, 'dist', 'index.cjs'), '')
  writeFileSync(join(source, 'package.json'), JSON.stringify({
    name: 'sharp', version: '0.35.5', main: 'dist/index.cjs', config: { libvips: '>=8.18.7' },
  }))
  const competingHeaders = join(root, 'node_modules', 'node-addon-api')
  mkdirSync(competingHeaders)
  writeFileSync(join(competingHeaders, 'index.js'), 'throw new Error("runtime headers must not override pinned build headers")')
  state.version = '8.18.7'
  state.failure = undefined
  state.buildDirectory = ''
  state.execute.mockImplementation(async (file, _args, options) => {
    if (file === 'pkg-config') return { stdout: `${state.version}\n`, stderr: '' }
    state.buildDirectory = options!.cwd!
    if (state.failure !== undefined) throw state.failure
    const requireSource = createRequire(join(state.buildDirectory, 'binding.gyp'))
    expect(requireSource.resolve('node-addon-api')).toBe(createRequire(import.meta.url).resolve('node-addon-api'))
    const output = join(state.buildDirectory, 'build', 'Release')
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, 'sharp-linux-x64-0.35.5.node'), 'compiled against system libvips')
    writeFileSync(join(output, 'compiler-output.o'), 'build-only object')
    return { stdout: '', stderr: '' }
  })
  return { root, source, options: { runtimeRoot: root, nodeVersion: '24.21.0', headerCache: join(root, 'headers') } }
}

it('compiles for the target Node version and copies only the addon before removing build sources', async () => {
  const f = fixture()
  await prepareLinuxSharp(f.options)
  expect(state.execute.mock.calls[1]![1]).toContain('--target=24.21.0')
  expect(state.execute.mock.calls[1]![2]!.env).toMatchObject({ SHARP_FORCE_GLOBAL_LIBVIPS: '1' })
  const output = join(f.source, 'src', 'build', 'Release')
  expect(readdirSync(output)).toEqual(['sharp-linux-x64-0.35.5.node'])
  expect(readFileSync(join(output, 'sharp-linux-x64-0.35.5.node'), 'utf8')).toBe('compiled against system libvips')
  expect(existsSync(dirname(state.buildDirectory))).toBe(false)
})

it('rejects an old system libvips before compiling or changing the runtime', async () => {
  const f = fixture()
  state.version = '8.17.0'
  await expect(prepareLinuxSharp(f.options)).rejects.toThrow('libvips >=8.18.7 is required')
  expect(state.execute).toHaveBeenCalledOnce()
  expect(existsSync(join(f.source, 'src', 'build'))).toBe(false)
})

it('reports missing libvips development files without compiling', async () => {
  const f = fixture()
  state.execute.mockRejectedValueOnce(new Error('pkg-config unavailable'))
  await expect(prepareLinuxSharp(f.options)).rejects.toThrow('install libvips development files and pkg-config')
  expect(state.execute).toHaveBeenCalledOnce()
})

it('removes temporary sources after compilation fails and publishes no addon', async () => {
  const f = fixture()
  state.failure = new Error('compiler failed')
  await expect(prepareLinuxSharp(f.options)).rejects.toBe(state.failure)
  expect(existsSync(dirname(state.buildDirectory))).toBe(false)
  expect(existsSync(join(f.source, 'src', 'build'))).toBe(false)
})
