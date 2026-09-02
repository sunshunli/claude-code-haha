import { expect, test } from "bun:test"
import {
  buildAzureOpenAIInput,
  parseAzureOpenAIResponse,
  resolveAzureOpenAIEndpoint,
  resolveAzureOpenAIDeployment,
} from "../src/services/api/azureOpenAI.js"

test("resolveAzureOpenAIEndpoint appends responses path and api-version", () => {
  const prevBase = process.env.AZURE_OPENAI_BASE_URL
  const prevVersion = process.env.AZURE_OPENAI_API_VERSION
  process.env.AZURE_OPENAI_BASE_URL =
    "https://example.cognitiveservices.azure.com/"
  process.env.AZURE_OPENAI_API_VERSION = "2025-04-01-preview"

  const url = resolveAzureOpenAIEndpoint()
  expect(url).toContain("/openai/responses")
  expect(url).toContain("api-version=2025-04-01-preview")

  process.env.AZURE_OPENAI_BASE_URL = prevBase
  process.env.AZURE_OPENAI_API_VERSION = prevVersion
})

test("resolveAzureOpenAIEndpoint normalizes existing Azure OpenAI paths", () => {
  const prevBase = process.env.AZURE_OPENAI_BASE_URL
  const prevVersion = process.env.AZURE_OPENAI_API_VERSION
  process.env.AZURE_OPENAI_API_VERSION = "2025-04-01-preview"

  process.env.AZURE_OPENAI_BASE_URL =
    "https://example.cognitiveservices.azure.com/openai/v1/?foo=bar"
  let url = new URL(resolveAzureOpenAIEndpoint())
  expect(url.pathname).toBe("/openai/responses")
  expect(url.searchParams.get("foo")).toBe("bar")
  expect(url.searchParams.get("api-version")).toBe("2025-04-01-preview")

  process.env.AZURE_OPENAI_BASE_URL =
    "https://example.cognitiveservices.azure.com/openai/responses?api-version=custom"
  url = new URL(resolveAzureOpenAIEndpoint())
  expect(url.pathname).toBe("/openai/responses")
  expect(url.searchParams.get("api-version")).toBe("2025-04-01-preview")

  process.env.AZURE_OPENAI_BASE_URL = prevBase
  process.env.AZURE_OPENAI_API_VERSION = prevVersion
})

test("buildAzureOpenAIInput maps tool_use and tool_result", () => {
  const input = buildAzureOpenAIInput([
    {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Running tool" },
          {
            type: "tool_use",
            id: "tool_1",
            name: "my_tool",
            input: { foo: "bar" },
          },
        ],
      },
    },
    {
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool_1",
            content: [{ type: "text", text: "ok" }],
          },
        ],
      },
    },
  ])

  expect(input.some(msg => msg.type === "function_call")).toBe(true)
  expect(input.some(msg => msg.type === "function_call_output")).toBe(true)
})

test("parseAzureOpenAIResponse uses call_id to pair tool results", () => {
  const result = parseAzureOpenAIResponse({
    id: "resp_1",
    output: [{
      type: "function_call",
      id: "item_1",
      call_id: "call_1",
      name: "my_tool",
      arguments: "{}",
    }],
  })

  expect(result.content).toContainEqual({
    type: "tool_use",
    id: "call_1",
    name: "my_tool",
    input: {},
  })
})

test("parseAzureOpenAIResponse uses id for a legacy tool_call item", () => {
  const result = parseAzureOpenAIResponse({
    id: "resp_1",
    output: [{
      type: "tool_call",
      id: "legacy_call_1",
      function: {
        name: "my_tool",
        arguments: "{}",
      },
    }],
  })

  expect(result.content).toContainEqual({
    type: "tool_use",
    id: "legacy_call_1",
    name: "my_tool",
    input: {},
  })
})

test("parseAzureOpenAIResponse uses a legacy tool_call_id when call_id is absent", () => {
  const result = parseAzureOpenAIResponse({
    id: "resp_1",
    output: [{
      type: "function_call",
      tool_call_id: "legacy_call_1",
      name: "my_tool",
      arguments: "{}",
    }],
  })

  expect(result.content).toContainEqual({
    type: "tool_use",
    id: "legacy_call_1",
    name: "my_tool",
    input: {},
  })
})

test("parseAzureOpenAIResponse prefers call_id over a legacy tool_call_id", () => {
  const result = parseAzureOpenAIResponse({
    id: "resp_1",
    output: [{
      type: "function_call",
      call_id: "call_1",
      tool_call_id: "legacy_call_1",
      name: "my_tool",
      arguments: "{}",
    }],
  })

  expect(result.content).toContainEqual({
    type: "tool_use",
    id: "call_1",
    name: "my_tool",
    input: {},
  })
})

test("parseAzureOpenAIResponse rejects an output item id without a call id", () => {
  expect(() => parseAzureOpenAIResponse({
    id: "resp_1",
    output: [{
      type: "function_call",
      id: "item_1",
      name: "my_tool",
      arguments: "{}",
    }],
  })).toThrow("missing call_id")
})

test("parseAzureOpenAIResponse rejects function calls without an association id", () => {
  expect(() => parseAzureOpenAIResponse({
    id: "resp_1",
    output: [{
      type: "function_call",
      name: "my_tool",
      arguments: "{}",
    }],
  })).toThrow("missing call_id")
})

test("buildAzureOpenAIInput rejects tool history without association ids", () => {
  expect(() => buildAzureOpenAIInput([{
    type: "assistant",
    message: {
      content: [{ type: "tool_use", name: "my_tool", input: {} }],
    },
  }])).toThrow("tool_use missing call_id")

  expect(() => buildAzureOpenAIInput([{
    type: "user",
    message: {
      content: [{ type: "tool_result", content: "ok" }],
    },
  }])).toThrow("tool_result missing call_id")
})

test("buildAzureOpenAIInput preserves user and tool-result images", () => {
  const input = buildAzureOpenAIInput([
    {
      type: "user",
      message: {
        content: [
          { type: "text", text: "Describe this" },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: "abc123" },
          },
        ],
      },
    },
    {
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool_1",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: "xyz789" },
              },
            ],
          },
        ],
      },
    },
  ])

  expect(input[0]).toEqual({
    type: "message",
    role: "user",
    content: [
      { type: "input_text", text: "Describe this" },
      { type: "input_image", image_url: "data:image/png;base64,abc123" },
    ],
  })
  expect(input[1]).toEqual({
    type: "function_call_output",
    call_id: "tool_1",
    output: [
      { type: "input_image", image_url: "data:image/jpeg;base64,xyz789" },
    ],
  })
  expect(input).toHaveLength(2)
})

test("buildAzureOpenAIInput maps document URLs and base64 data to input_file", () => {
  const input = buildAzureOpenAIInput([{
    type: "user",
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: "tool_1",
          content: [
            {
              type: "document",
              title: "report.pdf",
              source: { type: "base64", media_type: "application/pdf", data: "pdf-data" },
            },
            {
              type: "document",
              source: { type: "url", url: "https://example.test/report.pdf" },
            },
          ],
        },
      ],
    },
  }])

  expect(input).toEqual([{
    type: "function_call_output",
    call_id: "tool_1",
    output: [
      { type: "input_text", text: "[Document: report.pdf]\n" },
      { type: "input_file", file_data: "data:application/pdf;base64,pdf-data", filename: "report.pdf" },
      { type: "input_text", text: "[Document: https://example.test/report.pdf](https://example.test/report.pdf)" },
    ],
  }])
})
test("buildAzureOpenAIInput maps ordinary user documents", () => {
  const input = buildAzureOpenAIInput([{
    type: "user",
    message: {
      content: [{
        type: "document",
        title: "notes.txt",
        source: { type: "base64", media_type: "text/plain", data: "notes" },
      }],
    },
  }])

  expect(input).toEqual([{
    type: "message",
    role: "user",
    content: [
      { type: "input_text", text: "[Document: notes.txt]\n" },
      {
        type: "input_file",
        file_data: "data:text/plain;base64,notes",
        filename: "notes.txt",
      },
    ],
  }])
})

test("resolveAzureOpenAIDeployment throws when codex mapping is missing", () => {
  const prevBase = process.env.AZURE_OPENAI_BASE_URL
  const prevEnv = process.env.AZURE_OPENAI_CODEX_DEPLOYMENT
  process.env.AZURE_OPENAI_BASE_URL =
    "https://example.cognitiveservices.azure.com/"
  delete process.env.AZURE_OPENAI_CODEX_DEPLOYMENT

  expect(() => resolveAzureOpenAIDeployment("gpt-5.2-codex")).toThrow()
  expect(() => resolveAzureOpenAIDeployment("gpt-5.3-codex")).toThrow()
  expect(() => resolveAzureOpenAIDeployment("gpt-5.4-codex")).toThrow()

  process.env.AZURE_OPENAI_BASE_URL = prevBase
  process.env.AZURE_OPENAI_CODEX_DEPLOYMENT = prevEnv
})

test("resolveAzureOpenAIDeployment uses env default even if name matches", () => {
  const prevBase = process.env.AZURE_OPENAI_BASE_URL
  const prevEnv = process.env.AZURE_OPENAI_CODEX_DEPLOYMENT
  process.env.AZURE_OPENAI_BASE_URL =
    "https://example.cognitiveservices.azure.com/"
  process.env.AZURE_OPENAI_CODEX_DEPLOYMENT = "gpt-5.2-codex"

  const resolved = resolveAzureOpenAIDeployment("gpt-5.2-codex")
  expect(resolved).toBe("gpt-5.2-codex")

  process.env.AZURE_OPENAI_BASE_URL = prevBase
  process.env.AZURE_OPENAI_CODEX_DEPLOYMENT = prevEnv
})

test("buildAzureOpenAIInput maps image URL sources to input_image", () => {
  const input = buildAzureOpenAIInput([
    {
      type: "user",
      message: {
        content: [
          {
            type: "image",
            source: { type: "url", url: "https://example.test/screenshot.png" },
          },
        ],
      },
    },
    {
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool_1",
            content: [
              {
                type: "image",
                source: { type: "url", url: "https://example.test/tool-shot.png" },
              },
            ],
          },
        ],
      },
    },
  ])

  expect(input[0]).toEqual({
    type: "message",
    role: "user",
    content: [{ type: "input_image", image_url: "https://example.test/screenshot.png" }],
  })
  expect(input[1]).toEqual({
    type: "function_call_output",
    call_id: "tool_1",
    output: [{ type: "input_image", image_url: "https://example.test/tool-shot.png" }],
  })
})

test("buildAzureOpenAIInput keeps top-level text-degraded media", () => {
  const input = buildAzureOpenAIInput([{
    type: "user",
    message: {
      content: [
        {
          type: "search_result",
          title: "Top result",
          content: [{ type: "text", text: "Top snippet" }],
          source: "https://example.test/top",
        },
        {
          type: "document",
          title: "readme.txt",
          source: { type: "text", media_type: "text/plain", data: "plain text" },
        },
        {
          type: "document",
          title: "report.pdf",
          source: { type: "url", url: "https://example.test/report.pdf" },
        },
        {
          type: "image",
          source: { type: "file", file_id: "file_9" },
        },
      ],
    },
  }])

  expect(input).toEqual([{
    type: "message",
    role: "user",
    // Non-text source blocks keep the array shape so block boundaries stay
    // visible instead of being flattened with injected newlines.
    content: [
      { type: "input_text", text: "Top result — Top snippet — https://example.test/top" },
      { type: "input_text", text: "[Document: readme.txt]\nplain text" },
      { type: "input_text", text: "[Document: report.pdf](https://example.test/report.pdf)" },
      { type: "input_text", text: "[Image omitted: file-based image source is not supported by this endpoint.]" },
    ],
  }])
})

test("buildAzureOpenAIInput keeps model-visible title and context when degrading documents", () => {
  const input = buildAzureOpenAIInput([{
    type: "user",
    message: {
      content: [{
        type: "tool_result",
        tool_use_id: "tool_1",
        content: [{
          type: "document",
          title: "Auth specification",
          context: "The examples use production credentials",
          source: { type: "text", media_type: "text/plain", data: "Bearer abc123" },
        }],
      }],
    },
  }])

  expect(input).toEqual([{
    type: "function_call_output",
    call_id: "tool_1",
    output: [
      { type: "input_text", text: "[Document: Auth specification]\n[Document context: The examples use production credentials]\nBearer abc123" },
    ],
  }])
})

test("buildAzureOpenAIInput keeps inline images of custom-content documents", () => {
  const input = buildAzureOpenAIInput([{
    type: "user",
    message: {
      content: [{
        type: "tool_result",
        tool_use_id: "tool_1",
        content: [{
          type: "document",
          title: "cited",
          source: {
            type: "content",
            content: [
              { type: "text", text: "before" },
              { type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
              { type: "text", text: "after" },
            ],
          },
        }],
      }],
    },
  }])

  expect(input).toEqual([{
    type: "function_call_output",
    call_id: "tool_1",
    output: [
      { type: "input_text", text: "[Document: cited]\n" },
      { type: "input_text", text: "before" },
      { type: "input_image", image_url: "data:image/png;base64,abc" },
      { type: "input_text", text: "after" },
    ],
  }])
})
