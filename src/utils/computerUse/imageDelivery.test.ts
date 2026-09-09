import { expect, test } from 'bun:test'
import type { ToolUseContext } from '../../Tool.js'
import { MCPTool } from '../../tools/MCPTool/MCPTool.js'
import { frameAppStateEnvelope } from '../../vendor/computer-use-mcp/toolCalls.js'
import { anthropicToOpenaiChat } from '../../server/proxy/transform/anthropicToOpenaiChat.js'
import { anthropicToOpenaiResponses } from '../../server/proxy/transform/anthropicToOpenaiResponses.js'
import type { AnthropicContentBlock, AnthropicRequest } from '../../server/proxy/transform/types.js'
import { dispatchComputerUseCall } from './wrapper.js'

// Opaque fixture bytes: the transport must preserve them, not decode, resize
// or relabel them after the native helper has encoded its screenshot.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0x4a, 0x46, 0xff, 0xd9]).toString('base64')

test('a JPEG native screenshot keeps its bytes and MIME through the real CLI tool result and both model protocols', async () => {
  const nativeResult = frameAppStateEnvelope({
    pid: 42, elementCount: 1, truncated: false, durationMs: 1,
    axText: 'App=Fixture\nWindow: Canvas',
    screenshot: { base64: jpeg, width: 360, height: 280, mimeType: 'image/jpeg' },
  })
  const result = await dispatchComputerUseCall(async () => nativeResult, 'js', {
    code: 'await app.getAXStateAndScreenshot()',
  }, { abortController: new AbortController() } as ToolUseContext)
  const toolResult = MCPTool.mapToolResultToToolResultBlockParam(result.data as never, 'cu-shot')
  const image = (toolResult.content as AnthropicContentBlock[]).find(block => block.type === 'image')
  expect(image).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg } })

  const request: AnthropicRequest = {
    model: 'fixture', max_tokens: 100,
    messages: [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'cu-shot', name: 'computer_use', input: {} }] },
      { role: 'user', content: [toolResult as AnthropicContentBlock] },
    ],
  }
  for (const converted of [anthropicToOpenaiChat(request), anthropicToOpenaiResponses(request)]) {
    const wire = JSON.stringify(converted)
    expect(wire).toContain(`data:image/jpeg;base64,${jpeg}`)
    expect(wire).not.toContain('data:image/png;')
  }
})

test('older native helpers without screenshot MIME retain their PNG transport contract', async () => {
  const nativeResult = frameAppStateEnvelope({
    pid: 42, elementCount: 0, truncated: false, durationMs: 1, axText: 'App=Fixture',
    screenshot: { base64: 'iVBORw==', width: 1, height: 1 },
  })
  const result = await dispatchComputerUseCall(async () => nativeResult, 'js', {}, {
    abortController: new AbortController(),
  } as ToolUseContext)
  expect(result.data).toContainEqual({
    type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw==' },
  })
})
