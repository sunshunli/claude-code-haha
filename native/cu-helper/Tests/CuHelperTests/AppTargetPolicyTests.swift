import XCTest
@testable import cc_haha_computer_use

final class AppTargetPolicyTests: XCTestCase {
    func testOfficialTerminalAndSecurityBundlesAreDenied() {
        let denied = [
            "com.apple.Terminal",
            "com.googlecode.iterm2",
            "com.raphaelamorim.rio",
            "dev.commandline.waveterm",
            "com.apple.SecurityAgent",
            "com.apple.LocalAuthenticationRemoteService",
            "com.apple.UserNotificationCenter",
            "com.openai.codex.beta",
            "com.openai.chat.mac-debug",
        ]

        for bundleID in denied {
            XCTAssertEqual(AppTargetPolicy.decision(bundleID: bundleID), .deny, bundleID)
        }
    }

    func testNativeBrowserBundlesAreAllowed() {
        for bundleID in [
            "com.google.Chrome", "com.google.Chrome.canary", "com.apple.Safari",
            "org.mozilla.firefox", "com.microsoft.edgemac", "com.brave.Browser",
        ] {
            XCTAssertEqual(AppTargetPolicy.decision(bundleID: bundleID), .allow, bundleID)
        }
    }

    func testOtherAppCategoriesAreNotImplicitlyForbidden() {
        let allowed = [
            "com.webull.desktop.v1",
            "com.binance.BinanceDesktop",
            "com.electron.exodus",
            "com.ledger.live",
            "io.trezor.TrezorSuite",
        ]

        for bundleID in allowed {
            XCTAssertEqual(AppTargetPolicy.decision(bundleID: bundleID), .allow, bundleID)
        }
    }

    func testMediaAndDevelopmentAppsAreNotImplicitlyForbidden() {
        let allowed = [
            "com.spotify.client",
            "com.apple.Music",
            "com.amazon.aiv.AIVApp",
            "tv.plex.desktop",
            "com.amazon.Kindle",
            "com.microsoft.VSCode",
            "com.apple.shortcuts",
            "com.apple.dt.Xcode",
        ]

        for bundleID in allowed {
            XCTAssertEqual(AppTargetPolicy.decision(bundleID: bundleID), .allow, bundleID)
        }
    }

    func testForbiddenPolicyUsesExactIdentityNotNameSubstringOrPrefix() {
        for id in ["com.apple.Terminal.preview", "com.openai.codex.userapp", "org.example.Terminal", "com.apple.securityagent"] {
            XCTAssertEqual(AppTargetPolicy.decision(bundleID: id), .allow, id)
        }
    }

    func testNormalProductivityBundlesAreAllowed() {
        let allowed = [
            "com.apple.calculator",
            "com.apple.TextEdit",
            "com.apple.finder",
        ]

        for bundleID in allowed {
            XCTAssertEqual(AppTargetPolicy.decision(bundleID: bundleID), .allow, bundleID)
        }
    }

    func testIntrinsicHostAndHelperBundlesAreAlwaysDenied() {
        let expected: Set<String> = [
            "com.claude-code-haha.desktop",
            "dev.cchaha.cu-helper",
        ]

        XCTAssertEqual(AppTargetPolicy.intrinsicDeniedBundleIDs, expected)
        for bundleID in expected {
            XCTAssertEqual(AppTargetPolicy.decision(bundleID: bundleID), .deny, bundleID)
        }
    }

    func testDeniedBundleUnionCountAndSetDuplicateHandlingAreLocked() {
        XCTAssertEqual(AppTargetPolicy.deniedBundleIDs.count, 24)
        XCTAssertTrue(
            AppTargetPolicy.deniedBundleIDs
                .isDisjoint(with: AppTargetPolicy.intrinsicDeniedBundleIDs)
        )

        var copy = AppTargetPolicy.deniedBundleIDs
        let duplicate = copy.insert("com.apple.Terminal")
        XCTAssertFalse(duplicate.inserted)
        XCTAssertEqual(copy.count, 24)
    }
}
