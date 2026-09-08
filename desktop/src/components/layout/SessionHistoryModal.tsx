import { useEffect, useRef, useState } from 'react'
import { sessionsApi, type SessionsResponse } from '@/api/sessions'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { useTranslation } from '@/i18n'
import type { SessionListItem } from '@/types/session'

const PAGE_SIZE = 50

type HistoryPage = SessionsResponse & { offset: number }

// Mounted only while browsing: neither pages nor requests enter the sidebar's
// polling store. Only an explicitly selected session is retained by the caller.
export function SessionHistoryModal({ onClose, onSelect }: {
  onClose: () => void
  onSelect: (session: SessionListItem) => void
}) {
  const t = useTranslation()
  const [page, setPage] = useState<HistoryPage | null>(null)
  const [request, setRequest] = useState({ offset: 0, revision: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        let offset = request.offset
        let response = await sessionsApi.list({ limit: PAGE_SIZE, offset }, { signal: controller.signal })
        if (!current) return
        // Deletion / index rebuild may invalidate the last page. Correct once,
        // never spin on an empty or still-changing partial index.
        if (offset > 0 && offset >= response.total) {
          offset = lastPageOffset(response.total)
          response = await sessionsApi.list({ limit: PAGE_SIZE, offset }, { signal: controller.signal })
        }
        if (!current) return
        setPage({ ...response, offset })
        if (listRef.current) listRef.current.scrollTop = 0
      } catch (err) {
        if (current) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (current) setLoading(false)
      }
    })()
    return () => {
      current = false
      controller.abort()
    }
  }, [request])

  const loadPage = (offset: number) => {
    setLoading(true)
    setRequest((previous) => ({ offset, revision: previous.revision + 1 }))
  }
  const offset = page?.offset ?? 0
  const total = page?.total ?? 0
  const lastOffset = lastPageOffset(total)
  const partial = page?.index?.mode === 'on' && page.index.state === 'building'

  return (
    <Modal
      open
      onClose={onClose}
      title={t('sessionHistory.title')}
      width={720}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="base" disabled={loading} onClick={() => loadPage(offset)}>
            {t('sidebar.refreshSessions')}
          </Button>
          <div className="flex flex-wrap gap-1">
            <Button variant="secondary" size="base" disabled={loading || offset === 0} onClick={() => loadPage(0)}>
              {t('sessionHistory.newest')}
            </Button>
            <Button variant="secondary" size="base" disabled={loading || offset === 0} onClick={() => loadPage(Math.max(0, offset - PAGE_SIZE))}>
              {t('sessionHistory.previous')}
            </Button>
            <Button variant="secondary" size="base" disabled={loading || offset >= lastOffset} onClick={() => loadPage(offset + PAGE_SIZE)}>
              {t('sessionHistory.next')}
            </Button>
            <Button variant="secondary" size="base" disabled={loading || offset >= lastOffset} onClick={() => loadPage(lastOffset)}>
              {t('sessionHistory.oldest')}
            </Button>
          </div>
        </div>
      )}
    >
      <p className="mb-3 text-sm text-[var(--color-text-secondary)]">{t('sessionHistory.description')}</p>
      {partial && (
        <p role="status" className="mb-2 text-xs text-[var(--color-text-secondary)]">{t('sessionHistory.indexBuilding')}</p>
      )}
      <div role="status" aria-live="polite" className="mb-2 flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
        {loading && <Spinner size={14} />}
        {loading ? t('common.loading') : t('sessionHistory.range', {
          start: page?.sessions.length ? offset + 1 : 0,
          end: page?.sessions.length ? offset + page.sessions.length : 0,
          total,
        })}
      </div>
      {error && (
        <ErrorState title={t('sidebar.sessionListFailed')} detail={error} retryLabel={t('common.retry')} onRetry={() => loadPage(request.offset)} size="sm" />
      )}
      <div ref={listRef} data-testid="session-history-rows" aria-busy={loading} className="mt-2 h-[min(48vh,480px)] overflow-y-auto overscroll-contain">
        {!loading && !error && page?.sessions.length === 0 && <EmptyState title={t('sidebar.noSessions')} />}
        {page?.sessions.map((session, index) => (
          <button
            key={`${session.projectPath}:${session.id}:${index}`}
            type="button"
            disabled={loading}
            onClick={() => onSelect(session)}
            className="mb-1 flex w-full flex-col gap-1 rounded-[var(--radius-md)] px-3 py-2 text-left text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-border-focus)] disabled:opacity-50"
          >
            <span className="w-full truncate text-sm font-medium">{session.title || t('sidebar.newSession')}</span>
            <span className="flex w-full flex-wrap justify-between gap-x-3 text-xs text-[var(--color-text-secondary)]">
              <span className="min-w-0 flex-1 truncate" title={session.workDir || session.projectRoot || session.projectPath}>
                {session.workDir || session.projectRoot || session.projectPath}
              </span>
              <time dateTime={session.modifiedAt}>{formatDate(session.modifiedAt)}</time>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function lastPageOffset(total: number) {
  return Math.floor(Math.max(0, total - 1) / PAGE_SIZE) * PAGE_SIZE
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : ''
}
