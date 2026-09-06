import { afterEach, describe, expect, mock, test } from 'bun:test'
import {
  notifyMcpConnectionClosed,
  setMcpConnectionClosedHandler,
} from './client.js'

afterEach(() => {
  setMcpConnectionClosedHandler(undefined)
})

describe('MCP connection close handler', () => {
  test('notifies the registered session handler', () => {
    const handler = mock(() => {})
    setMcpConnectionClosedHandler(handler)

    notifyMcpConnectionClosed('test-server')

    expect(handler).toHaveBeenCalledWith('test-server')
  })

  test('uses the latest handler and stops notifying after unregister', () => {
    const staleHandler = mock(() => {})
    const activeHandler = mock(() => {})
    setMcpConnectionClosedHandler(staleHandler)
    setMcpConnectionClosedHandler(activeHandler)

    notifyMcpConnectionClosed('test-server')
    setMcpConnectionClosedHandler(undefined)
    notifyMcpConnectionClosed('test-server')

    expect(staleHandler).not.toHaveBeenCalled()
    expect(activeHandler).toHaveBeenCalledTimes(1)
  })
})
