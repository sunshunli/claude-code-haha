import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { _test as deniedApps } from './deniedApps.js'
import { NATIVE_FORBIDDEN_BUNDLE_IDS } from './nativeAppPolicy.js'

const SWIFT_SET_MARKER = 'static let deniedBundleIDs: Set<String> = ['
const SWIFT_INTRINSIC_SET_MARKER = 'static let intrinsicDeniedBundleIDs: Set<String> = ['

function parseNativeDeniedBundleIds(source: string, marker: string): string[] {
  const markerIndex = source.indexOf(marker)
  expect(markerIndex).toBeGreaterThanOrEqual(0)

  const bodyStart = markerIndex + marker.length
  const bodyEnd = source.indexOf('\n    ]', bodyStart)
  expect(bodyEnd).toBeGreaterThan(bodyStart)

  const body = source.slice(bodyStart, bodyEnd)
  return [...body.matchAll(/^\s*"([^"]+)",?\s*(?:\/\/.*)?$/gm)].map(match => match[1])
}

test('native deny policy matches the official 24 exact forbidden identities', () => {
  const tsEntries = [...NATIVE_FORBIDDEN_BUNDLE_IDS]
  const expected = new Set(tsEntries)

  const swiftPath = resolve(
    import.meta.dir,
    '../../../native/cu-helper/Sources/cu-helper/AppTargetPolicy.swift',
  )
  const nativeEntries = parseNativeDeniedBundleIds(
    readFileSync(swiftPath, 'utf8'),
    SWIFT_SET_MARKER,
  )
  const actual = new Set(nativeEntries)

  const missing = [...expected].filter(bundleId => !actual.has(bundleId)).sort()
  const extra = [...actual].filter(bundleId => !expected.has(bundleId)).sort()

  expect(tsEntries).toHaveLength(expected.size)
  expect(nativeEntries).toHaveLength(actual.size)
  expect(expected.size).toBe(24)
  expect(actual.size).toBe(24)
  expect(missing).toEqual([])
  expect(extra).toEqual([])
  expect([...actual].sort()).toEqual([...expected].sort())
  // Browser classification still exists for the Windows tool tier. Native
  // macOS control may use the same browser as the official Codex app surface.
  expect(deniedApps.BROWSER_BUNDLE_IDS.size).toBe(29)
  expect([...deniedApps.BROWSER_BUNDLE_IDS].filter(bundleId => actual.has(bundleId))).toEqual([])
})

test('native intrinsic deny set stays separate and matches the TS host/helper defaults', () => {
  const swiftPath = resolve(
    import.meta.dir,
    '../../../native/cu-helper/Sources/cu-helper/AppTargetPolicy.swift',
  )
  const nativeEntries = parseNativeDeniedBundleIds(
    readFileSync(swiftPath, 'utf8'),
    SWIFT_INTRINSIC_SET_MARKER,
  )
  const expected = deniedApps.INTRINSIC_DENIED_BUNDLE_IDS

  expect(new Set(nativeEntries)).toEqual(expected)
  expect(expected).toEqual(new Set([
    'com.claude-code-haha.desktop',
    'dev.cchaha.cu-helper',
  ]))
  expect(nativeEntries).toHaveLength(2)
})
