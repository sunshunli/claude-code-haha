import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionHistoryModal } from './SessionHistoryModal'
import { sessionsApi, type SessionsResponse } from '@/api/sessions'
import { useSessionStore } from '@/stores/sessionStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useSessionRuntimeStore } from '@/stores/sessionRuntimeStore'

vi.mock('@/api/sessions', () => ({ sessionsApi: { list: vi.fn() } }))

function response(offset: number, total = 451): SessionsResponse {
  return {
    total,
    sessions: Array.from({ length: Math.min(50, Math.max(0, total - offset)) }, (_, index) => ({
      id: `history-${offset + index}`, title: `History ${offset + index}`,
      createdAt: '2020-01-01T00:00:00.000Z', modifiedAt: '2020-01-01T00:00:00.000Z',
      projectPath: `/old-project-${offset + index}`, workDir: `/old-project-${offset + index}`, workDirExists: true, messageCount: 12,
    })),
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
const list = vi.mocked(sessionsApi.list)
const show = () => render(<SessionHistoryModal onClose={vi.fn()} onSelect={vi.fn()} />)
beforeEach(() => {
  useSettingsStore.setState({ locale: 'en' })
  list.mockReset()
  list.mockImplementation(async (params) => response(params?.offset ?? 0))
})
afterEach(cleanup)

describe('SessionHistoryModal', () => {
  it('browses beyond 400 and old-only projects with bounded rows and no sidebar/runtime writes', async () => {
    const recent = useSessionStore.getState().sessions
    const selections = useSessionRuntimeStore.getState().selections
    const onSelect = vi.fn()
    render(<SessionHistoryModal onClose={vi.fn()} onSelect={onSelect} />)
    const rows = screen.getByTestId('session-history-rows')
    await screen.findByText('History 0')
    expect(within(rows).getAllByRole('button')).toHaveLength(50)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Oldest' }))
    await screen.findByText('History 450')
    expect(list).toHaveBeenLastCalledWith({ limit: 50, offset: 450 }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(within(rows).getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByText('History 0')).not.toBeInTheDocument()
    expect(screen.getByText('/old-project-450')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    fireEvent.click(within(rows).getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith(response(450).sessions[0])
    expect(useSessionStore.getState().sessions).toBe(recent)
    expect(useSessionRuntimeStore.getState().selections).toBe(selections)
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByText('History 400')
    expect(within(rows).getAllByRole('button')).toHaveLength(50)
    fireEvent.click(screen.getByRole('button', { name: 'Newest' }))
    await screen.findByText('History 0')
  })

  it('preserves the displayed page on failure and retries the requested page', async () => {
    show()
    await screen.findByText('History 0')
    list.mockRejectedValueOnce(new Error('Offline fixture'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline fixture')
    expect(screen.getByText('1–50 of 451')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('History 50')
    expect(screen.getByText('51–100 of 451')).toBeInTheDocument()
  })

  it('corrects offsets invalidated by deletion once without looping', async () => {
    show()
    await screen.findByText('History 0')
    list.mockResolvedValueOnce(response(450, 51)).mockResolvedValueOnce(response(50, 51))
    fireEvent.click(screen.getByRole('button', { name: 'Oldest' }))
    await screen.findByText('History 50')
    expect(screen.getByText('51–51 of 51')).toBeInTheDocument()
    expect(list.mock.calls.map(([params]) => params?.offset)).toEqual([0, 450, 50])
    list.mockResolvedValueOnce(response(50, 0)).mockResolvedValueOnce(response(0, 0))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sessions' }))
    await waitFor(() => expect(screen.getByText('0–0 of 0')).toBeInTheDocument())
    expect(list).toHaveBeenCalledTimes(5)
  })

  it('refreshes partial indexes on demand without polling', async () => {
    list.mockResolvedValueOnce({ ...response(0, 0), index: {
      mode: 'on', state: 'building', discovered: 451, indexed: 0,
      degradedSources: 0, databaseBytes: 0, walBytes: 0, lastUpdatedAt: null, lastErrorCode: null,
    } })
    show()
    await screen.findByText(/History is still being indexed/)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sessions' }))
    await screen.findByText('History 0')
    expect(screen.queryByText(/History is still being indexed/)).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('stops automatic correction if the total shrinks again during correction', async () => {
    show()
    await screen.findByText('History 0')
    list.mockResolvedValueOnce(response(450, 51)).mockResolvedValueOnce(response(50, 0))
    fireEvent.click(screen.getByRole('button', { name: 'Oldest' }))
    await screen.findByText('0–0 of 0')
    expect(list).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('button', { name: 'Newest' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Refresh sessions' })).toBeEnabled()
  })

  it('aborts on close and ignores stale completion after reopening', async () => {
    const oldRequest = deferred<SessionsResponse>()
    list.mockReturnValueOnce(oldRequest.promise)
    const first = show()
    const signal = list.mock.calls[0]![1]!.signal!
    first.unmount()
    expect(signal.aborted).toBe(true)
    show()
    await screen.findByText('History 0')
    await act(async () => oldRequest.resolve(response(450)))
    expect(screen.queryByText('History 450')).not.toBeInTheDocument()
  })

  it('pages by raw offsets with duplicate IDs, resets scroll and disables paging while loading', async () => {
    const page = response(0)
    page.sessions[1] = { ...page.sessions[0]!, projectPath: '/another-copy' }
    list.mockResolvedValueOnce(page)
    show()
    await screen.findByText('History 2')
    const rows = screen.getByTestId('session-history-rows')
    expect(within(rows).getAllByRole('button')).toHaveLength(50)
    rows.scrollTop = 300
    const nextPage = deferred<SessionsResponse>()
    list.mockReturnValueOnce(nextPage.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(list.mock.calls[1]![0]).toEqual({ limit: 50, offset: 50 })
    await act(async () => nextPage.resolve(response(50)))
    expect(rows.scrollTop).toBe(0)
    expect(screen.getByText('History 50')).toBeInTheDocument()
  })

  it('supports Escape and restores focus to the opener', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const onClose = vi.fn()
    const view = render(<SessionHistoryModal onClose={onClose} onSelect={vi.fn()} />)
    await screen.findByText('History 0')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    view.unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
