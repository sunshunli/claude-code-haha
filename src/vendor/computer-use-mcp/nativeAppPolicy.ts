import { isIntrinsicAppDenied } from './deniedApps.js'

// Official macOS SkyComputerUseService 26.831.1000926:
// isForbiddenComputerUseTarget checks these four sets with exact equality.
// Legacy cross-platform tiers and display-name matches do not apply here.
export const NATIVE_FORBIDDEN_BUNDLE_IDS: ReadonlySet<string> = new Set([
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'org.alacritty',
  'dev.warp.Warp-Stable',
  'net.kovidgoyal.kitty',
  'co.zeit.hyper',
  'com.github.wez.wezterm',
  'org.tabby',
  'com.mitchellh.ghostty',
  'com.raphaelamorim.rio',
  'dev.commandline.waveterm',
  'com.openai.codex',
  'com.openai.codex.alpha',
  'com.openai.codex.beta',
  'com.openai.codex.dev',
  'com.openai.codex.nightly',
  'com.openai.chat',
  'com.openai.chat.alpha',
  'com.openai.chat.beta',
  'com.openai.chat.nightly',
  'com.openai.chat.mac-debug',
  'com.apple.UserNotificationCenter',
  'com.apple.LocalAuthenticationRemoteService',
  'com.apple.SecurityAgent',
])

export function isNativeAppDenied(bundleId: string | undefined, hostBundleId?: string): boolean {
  return isIntrinsicAppDenied(bundleId, hostBundleId) ||
    (bundleId !== undefined && NATIVE_FORBIDDEN_BUNDLE_IDS.has(bundleId))
}
