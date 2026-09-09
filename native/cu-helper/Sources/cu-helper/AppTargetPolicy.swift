import Foundation

/// Built-in macOS native policy, matched by exact resolved bundle identity.
/// The installed official service checks terminal, Computer Use host, ChatGPT,
/// and system-security groups. Other categories remain subject to app approval;
/// the older generic Windows terminal/IDE/media/trading lists do not define this
/// native boundary.
enum AppTargetPolicy {
    enum Decision: Equatable, Sendable {
        case allow
        case deny
    }

    /// Process identities that Computer Use must never inspect or control.
    /// Keep these independent from the mirrored generic policy set below: the
    /// host and helper remain denied even if the cross-language policy changes.
    static let intrinsicDeniedBundleIDs: Set<String> = [
        "com.claude-code-haha.desktop",
        "dev.cchaha.cu-helper",
    ]

    /// Audited against SkyComputerUseService 26.831.1000926's
    /// BundleIdentifiers.isForbiddenComputerUseTarget (0x100240a14).
    /// Keep this literal set cross-checked with nativeAppPolicy.ts.
    static let deniedBundleIDs: Set<String> = [
        // terminal
        "com.apple.Terminal",
        "com.googlecode.iterm2",
        "org.alacritty",
        "dev.warp.Warp-Stable",
        "net.kovidgoyal.kitty",
        "co.zeit.hyper",
        "com.github.wez.wezterm",
        "org.tabby",
        "com.mitchellh.ghostty",
        "com.raphaelamorim.rio",
        "dev.commandline.waveterm",
        // computerUseHost
        "com.openai.codex",
        "com.openai.codex.alpha",
        "com.openai.codex.beta",
        "com.openai.codex.dev",
        "com.openai.codex.nightly",
        // chatGPT
        "com.openai.chat",
        "com.openai.chat.alpha",
        "com.openai.chat.beta",
        "com.openai.chat.nightly",
        "com.openai.chat.mac-debug",
        // systemSecurity
        "com.apple.UserNotificationCenter",
        "com.apple.LocalAuthenticationRemoteService",
        "com.apple.SecurityAgent",
    ]

    static func decision(bundleID: String) -> Decision {
        if intrinsicDeniedBundleIDs.contains(bundleID)
            || deniedBundleIDs.contains(bundleID) {
            return .deny
        }
        return .allow
    }
}
