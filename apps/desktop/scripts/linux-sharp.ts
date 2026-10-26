/** Build sharp against system libvips so Linux Electron and sharp use the same GLib. */

import { execFile } from 'node:child_process'
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { satisfies, valid } from 'semver'

const run = promisify(execFile)
const requireBuild = createRequire(import.meta.url)

/** Locations and Node version used to prepare one Linux runtime. */
export interface LinuxSharpBuildOptions {
  readonly runtimeRoot: string
  readonly nodeVersion: string
  /** Build-only Node headers; never copied into the application. */
  readonly headerCache: string
}

/**
 * Compile the installed sharp version against system libvips and copy only its runtime addon.
 * Linux Electron exposes system GLib symbols that conflict with sharp's prebuilt libvips.
 * The application therefore requires compatible system libvips at runtime.
 * @param options - Prepared production modules, target Node version and private header cache.
 * @returns Resolves after copying the compiled addon into sharp's source-build lookup path.
 * @throws If libvips development files are missing or too old, or compilation fails. Temporary
 *   sources are removed on failure; the caller must discard an incomplete runtime.
 */
export async function prepareLinuxSharp(options: LinuxSharpBuildOptions): Promise<void> {
  const requireRuntime = createRequire(join(options.runtimeRoot, 'package.json'))
  const source = dirname(dirname(requireRuntime.resolve('sharp')))
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as {
    version: string
    config: { libvips: string }
  }
  let vips: string
  try {
    vips = (await run('pkg-config', ['--modversion', 'vips-cpp'])).stdout.trim()
  } catch (error) {
    throw new Error('desktop Linux runtime: install libvips development files and pkg-config before packaging', { cause: error })
  }
  if (valid(vips) === null || !satisfies(vips, manifest.config.libvips)) {
    throw new Error(`desktop Linux runtime: libvips ${manifest.config.libvips} is required; found ${vips}`)
  }
  const scratch = mkdtempSync(join(tmpdir(), 'desktop-linux-sharp-'))
  try {
    const directory = join(scratch, 'sharp')
    cpSync(source, directory, { recursive: true, filter: path => path !== join(source, 'node_modules') })
    const linkType = process.platform === 'win32' ? 'junction' : 'dir'
    symlinkSync(join(options.runtimeRoot, 'node_modules'), join(scratch, 'node_modules'), linkType)
    const dependencies = join(directory, 'node_modules')
    mkdirSync(dependencies)
    symlinkSync(dirname(requireBuild.resolve('node-addon-api')), join(dependencies, 'node-addon-api'), linkType)
    const build = await run(process.execPath, [
      requireBuild.resolve('node-gyp/bin/node-gyp.js'), 'rebuild',
      `--target=${options.nodeVersion}`, `--devdir=${options.headerCache}`,
    ], { cwd: join(directory, 'src'), env: { ...process.env, SHARP_FORCE_GLOBAL_LIBVIPS: '1' }, maxBuffer: 8 * 1024 * 1024 })
    process.stdout.write(build.stdout)
    process.stderr.write(build.stderr)
    const filename = `sharp-linux-x64-${manifest.version}.node`
    const destination = join(source, 'src', 'build', 'Release')
    mkdirSync(destination, { recursive: true })
    copyFileSync(join(directory, 'src', 'build', 'Release', filename), join(destination, filename))
    console.log(`desktop Linux runtime: sharp ${manifest.version} rebuilt against system libvips ${vips}`)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
