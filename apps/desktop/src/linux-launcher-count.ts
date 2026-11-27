/** Publish an absolute count to Linux launchers using the shared session bus. */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type koffi from 'koffi'

/**
 * Keep the same bus sender for the lifetime of the taskbar badge. Plasma removes
 * a launcher's count as soon as the sender disconnects.
 * @param appPath - packaged Electron application root, or the development desktop package.
 * @param packaged - resolve the packaged runtime's native bindings when installed.
 * @returns native publication and connection cleanup.
 */
export function openLauncherCount(appPath: string, packaged: boolean): { set(count: number): void; close(): void } {
  const require = createRequire(join(appPath, ...(packaged ? ['dsh'] : []), 'package.json'))
  const ffi: typeof koffi = require('koffi')
  const gio = ffi.load('libgio-2.0.so.0')
  const connect = gio.func('void *g_bus_get_sync(int type, void *cancellable, void *error)')
  const parse = gio.func('void *g_variant_parse(void *type, const char *text, void *limit, void *end, void *error)')
  const emit = gio.func('int g_dbus_connection_emit_signal(void *bus, const char *dest, const char *path, const char *iface, const char *name, void *args, void *error)')
  const free = gio.func('void g_variant_unref(void *value)')
  const unref = gio.func('void g_object_unref(void *value)')
  const bus = connect(2, null, null)
  if (!bus) throw new Error('Linux taskbar session bus is unavailable')
  return {
    set(count) {
      const args = parse(null, `('application://com.deepseek.harness.desktop', {'count': <int64 ${count}>, 'count-visible': <${count > 0}>})`, null, null, null)
      if (!args) throw new Error('Could not encode Linux taskbar count')
      try {
        if (!emit(bus, null, '/com/deepseek/harness/LauncherEntry', 'com.canonical.Unity.LauncherEntry', 'Update', args, null)) {
          throw new Error('Could not publish Linux taskbar count')
        }
      } finally { free(args) }
    },
    close() { unref(bus) },
  }
}
