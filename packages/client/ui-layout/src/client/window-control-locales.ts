/** Window control labels follow the active application language. */
export const en = {
  label: 'Window controls', minimize: 'Minimize', maximize: 'Maximize', restore: 'Restore window', close: 'Close',
  failed: 'Could not operate the window. Try again.',
}
/** Chinese window control labels. */
export const zh = { label: '窗口操作', minimize: '最小化', maximize: '最大化', restore: '还原窗口', close: '关闭', failed: '无法操作窗口，请重试。' } satisfies Record<keyof typeof en, string>
/** Japanese window control labels. */
export const ja = { label: 'ウィンドウ操作', minimize: '最小化', maximize: '最大化', restore: '元のサイズに戻す', close: '閉じる', failed: 'ウィンドウを操作できませんでした。もう一度お試しください。' } satisfies Record<keyof typeof en, string>
/** Spanish window control labels. */
export const es = { label: 'Controles de ventana', minimize: 'Minimizar', maximize: 'Maximizar', restore: 'Restaurar ventana', close: 'Cerrar', failed: 'No se pudo controlar la ventana. Inténtalo de nuevo.' } satisfies Record<keyof typeof en, string>
/** French window control labels. */
export const fr = { label: 'Commandes de fenêtre', minimize: 'Réduire', maximize: 'Agrandir', restore: 'Restaurer la fenêtre', close: 'Fermer', failed: 'Impossible de contrôler la fenêtre. Réessayez.' } satisfies Record<keyof typeof en, string>
/** German window control labels. */
export const de = { label: 'Fenstersteuerung', minimize: 'Minimieren', maximize: 'Maximieren', restore: 'Fenster wiederherstellen', close: 'Schließen', failed: 'Das Fenster konnte nicht gesteuert werden. Versuche es erneut.' } satisfies Record<keyof typeof en, string>
/** Russian window control labels. */
export const ru = { label: 'Управление окном', minimize: 'Свернуть', maximize: 'Развернуть', restore: 'Восстановить окно', close: 'Закрыть', failed: 'Не удалось выполнить действие с окном. Повторите попытку.' } satisfies Record<keyof typeof en, string>
/** Portuguese window control labels. */
export const pt = { label: 'Controles da janela', minimize: 'Minimizar', maximize: 'Maximizar', restore: 'Restaurar janela', close: 'Fechar', failed: 'Não foi possível controlar a janela. Tente novamente.' } satisfies Record<keyof typeof en, string>
