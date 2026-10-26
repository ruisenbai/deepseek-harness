/** Install a prepared Linux application for one user and publish its desktop launcher atomically. */

import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { desktopTargetBuildPaths } from './desktop-build-paths.mjs'

/** Prepared application and user-owned installation prefix. */
export interface LinuxDesktopInstallOptions {
  readonly source: string
  /** Normally `~/.local`; the application and launcher stay below this directory. */
  readonly prefix: string
}

/** Locations of the installed application copy and published desktop entry. */
export interface LinuxDesktopInstallation {
  readonly directory: string
  readonly desktopFile: string
}

function desktopValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('\r', '\\r').replaceAll('\t', '\\t')
}

function desktopExecutable(path: string): string {
  return desktopValue(`"${path.replace(/[\\"`$]/gu, '\\$&').replaceAll('%', '%%')}"`)
}

/**
 * Copy a prepared application and replace its desktop entry after every file has been copied.
 * Previous application copies remain usable by running processes. A failed copy or publication
 * removes the new copy and retains the previous desktop entry.
 * @param options - Prepared Linux application directory and user installation prefix.
 * @returns Installed paths; launching uses the copied application independently of the checkout.
 * @throws If required application files are absent or copying or desktop-entry publication fails.
 */
export function installLinuxDesktop(options: LinuxDesktopInstallOptions): LinuxDesktopInstallation {
  const source = resolve(options.source)
  for (const file of ['deepseek-harness', 'resources/app.asar', 'resources/icon.png']) {
    if (!statSync(join(source, file)).isFile()) throw new Error(`desktop install: missing application file ${file}`)
  }
  const installations = join(resolve(options.prefix), 'opt', 'deepseek-harness')
  const applications = join(resolve(options.prefix), 'share', 'applications')
  mkdirSync(installations, { recursive: true })
  mkdirSync(applications, { recursive: true })
  const directory = mkdtempSync(join(installations, 'build-'))
  const desktopFile = join(applications, 'com.deepseek.harness.desktop')
  let published = false
  let staging: string | undefined
  try {
    staging = mkdtempSync(join(applications, '.deepseek-harness-'))
    cpSync(source, directory, { recursive: true, verbatimSymlinks: true })
    const entry = join(staging, 'entry.desktop')
    writeFileSync(entry, [
      '[Desktop Entry]', 'Type=Application', 'Name=DeepSeek Harness',
      `Exec=${desktopExecutable(join(directory, 'deepseek-harness'))} %U`,
      `Icon=${desktopValue(join(directory, 'resources', 'icon.png'))}`,
      'Terminal=false', 'Categories=Development;', 'StartupWMClass=com.deepseek.harness',
      'MimeType=x-scheme-handler/dsh;', '',
    ].join('\n'), { mode: 0o644 })
    renameSync(entry, desktopFile)
    published = true
    return { directory, desktopFile }
  } finally {
    if (staging !== undefined) rmSync(staging, { recursive: true, force: true })
    if (!published) rmSync(directory, { recursive: true, force: true })
  }
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('desktop install: requires Linux x64')
  const { values } = parseArgs({ options: { source: { type: 'string' }, prefix: { type: 'string' } } })
  const source = values.source ?? join(desktopTargetBuildPaths('linux-x64').unsignedArtifacts, 'linux-unpacked')
  const installed = installLinuxDesktop({ source, prefix: values.prefix ?? join(homedir(), '.local') })
  console.log(`Installed: ${installed.directory}\nDesktop entry: ${installed.desktopFile}`)
}
