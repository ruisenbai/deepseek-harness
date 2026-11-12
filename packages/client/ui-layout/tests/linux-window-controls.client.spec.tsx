// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LinuxWindowControls, type WindowControlsProps } from '../src/client/LinuxWindowControls.tsx'
import { en, zh } from '../src/client/window-control-locales.ts'

afterEach(cleanup)

function props(maximized = false): WindowControlsProps {
  return {
    t: key => (en as Readonly<Record<string, string>>)[key] ?? key,
    useMaximized: select => select(maximized),
    command: vi.fn(async () => {}),
  }
}

it('names and operates the three window controls and switches restore artwork with native state', async () => {
  const input = props()
  const view = render(<LinuxWindowControls {...input} />)
  const labels = () => screen.getAllByRole('button').map(button => button.getAttribute('aria-label'))
  const initial = labels()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  })
  expect(input.command).toHaveBeenNthCalledWith(1, 'minimize')
  expect(input.command).toHaveBeenNthCalledWith(2, 'toggle-maximize')
  expect(input.command).toHaveBeenNthCalledWith(3, 'close')
  view.rerender(<LinuxWindowControls {...input} useMaximized={select => select(true)} />)
  expect(screen.getByRole('button', { name: 'Restore window' }).querySelector('svg path')).not.toBeNull()
  await expect(JSON.stringify({ windowed: initial, maximized: labels() }, null, 2) + '\n')
    .toMatchFileSnapshot('./expected/linux-window-controls.json')
  view.unmount()
  expect(document.querySelector('[data-linux-window-controls]')).toBeNull()
})

it('shows localized failure feedback and clears it when the next operation succeeds', async () => {
  const input = props()
  vi.mocked(input.command).mockRejectedValueOnce(new Error('owner unavailable'))
  render(<LinuxWindowControls {...input} t={key => (zh as Readonly<Record<string, string>>)[key] ?? key} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '最小化' })) })
  expect(screen.getByRole('alert').textContent).toBe(zh.failed)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '最小化' })) })
  expect(screen.queryByRole('alert')).toBeNull()
})
