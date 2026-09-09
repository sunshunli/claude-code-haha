import { describe, expect, test } from 'bun:test'
import { buildSessionContext, createComputerUseEscapeHandler, dispatchComputerUseCall } from './wrapper.js'
import type { ToolUseContext } from '../../Tool.js'

describe('Computer Use session authorization', () => {
  test('enables every supported app without exposing a runtime permission callback', () => {
    const context = buildSessionContext()

    expect(context.getAllowedApps()).toEqual([])
    expect(context.getUserDeniedBundleIds()).toEqual([])
    expect(context.getGrantFlags()).toEqual({
      clipboardRead: true,
      clipboardWrite: true,
      systemKeyCombos: true,
    })
    expect(context.onPermissionRequest).toBeUndefined()
  })
})

describe('Computer Use CLI dispatch boundary', () => {
  const context = () => ({ abortController: new AbortController() }) as ToolUseContext

  test('pins cancellation to this call rather than the latest queued context', async () => {
    const callContext = context()
    const result = await dispatchComputerUseCall(async (_tool, _args, signal) => {
      expect(signal).toBe(callContext.abortController.signal)
      callContext.abortController.abort()
      expect(signal?.aborted).toBe(true)
      return { content: [{ type: 'text', text: 'cancelled' }] }
    }, 'sequence', { app: 'Finder', steps: [] }, callContext)
    expect(result.data).toEqual([{ type: 'text', text: 'cancelled' }])
  })

  test('preserves partial sequence progress for both the model and SDK', async () => {
    const summary = { status: 'completed', completedSteps: 2, totalSteps: 2 }
    const result = await dispatchComputerUseCall(async () => ({
      structuredContent: summary,
      content: [{ type: 'text', text: 'Current app state' }],
    }), 'sequence', {}, context())
    expect(result.data).toContainEqual({ type: 'text', text: JSON.stringify(summary) })
    expect(result.mcpMeta?.structuredContent).toEqual(summary)
  })

  test('a failed sequence remains a tool error with the completed-step evidence', async () => {
    const summary = { status: 'failed', completedSteps: 1, failedStepIndex: 1, resultUnknown: true }
    try {
      await dispatchComputerUseCall(async () => ({
        isError: true,
        structuredContent: summary,
        content: [{ type: 'text', text: 'Inspect state before retrying; do not replay completed steps.' }],
      }), 'sequence', {}, context())
      throw new Error('failed tool was returned as success')
    } catch (error) {
      expect(String(error)).toContain(JSON.stringify(summary))
      expect(String(error)).toContain('do not replay completed steps')
    }
  })
})

test('queued CLI calls keep their AppState accessors isolated', async () => {
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  const firstContext = {
    abortController: new AbortController(),
    getAppState: () => ({ computerUseMcpState: { selectedDisplayId: 1 } }),
  } as ToolUseContext
  const secondContext = {
    abortController: new AbortController(),
    getAppState: () => ({ computerUseMcpState: { selectedDisplayId: 2 } }),
  } as ToolUseContext
  const session = buildSessionContext()
  const first = dispatchComputerUseCall(async () => {
    await waiting
    return { content: [{ type: 'text', text: String(session.getSelectedDisplayId()) }] }
  }, 'sequence', {}, firstContext)
  const second = dispatchComputerUseCall(async () => ({
    content: [{ type: 'text', text: String(session.getSelectedDisplayId()) }],
  }), 'click', {}, secondContext)
  expect((await second).data).toEqual([{ type: 'text', text: '2' }])
  release()
  expect((await first).data).toEqual([{ type: 'text', text: '1' }])
})


test('a host Escape callback aborts its turn outside any dispatch async context', async () => {
  const turnController = new AbortController()
  const nextController = new AbortController()
  const onEscape = createComputerUseEscapeHandler(turnController)
  await dispatchComputerUseCall(async () => ({ content: [] }), 'click', {}, {
    abortController: nextController,
  } as ToolUseContext)
  // Simulate a host callback delivered after the promise context has gone away.
  onEscape()
  expect(turnController.signal.aborted).toBe(true)
  expect(nextController.signal.aborted).toBe(false)
})
