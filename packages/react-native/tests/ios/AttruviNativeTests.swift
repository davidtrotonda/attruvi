import XCTest
import React
@testable import AttruviReactNative

final class AttruviNativeTests: XCTestCase {
  private func identifiers(_ module: AttruviNative, reset: Bool = false) throws -> [String: String] {
    var result: [String: String]?
    var failure: String?
    let resolve: RCTPromiseResolveBlock = { result = $0 as? [String: String] }
    let reject: RCTPromiseRejectBlock = { _, message, _ in failure = message }
    if reset { module.resetAnonymousId(resolve, rejecter: reject) }
    else { module.getOrCreateIdentifiers(resolve, rejecter: reject) }
    XCTAssertNil(failure)
    return try XCTUnwrap(result)
  }

  func testKeychainIdentifiersPersistAcrossModuleInstances() throws {
    let first = try identifiers(AttruviNative())
    let second = try identifiers(AttruviNative())
    XCTAssertEqual(first, second)
    XCTAssertNotNil(UUID(uuidString: try XCTUnwrap(first["installationId"])))
    XCTAssertNotNil(UUID(uuidString: try XCTUnwrap(first["anonymousId"])))
  }

  func testResetChangesAnonymousIdentifierAndPreservesInstallation() throws {
    let module = AttruviNative()
    let before = try identifiers(module)
    let after = try identifiers(module, reset: true)
    XCTAssertEqual(before["installationId"], after["installationId"])
    XCTAssertNotEqual(before["anonymousId"], after["anonymousId"])
    XCTAssertEqual(after, try identifiers(AttruviNative()))
  }

  func testIdentityRoundTripAndDeletion() throws {
    let module = AttruviNative()
    let identity = "{\"userId\":\"ios-native-test\",\"traits\":{}}"
    var failure: String?
    let reject: RCTPromiseRejectBlock = { _, message, _ in failure = message }
    module.setIdentity(identity, resolver: { _ in }, rejecter: reject)
    XCTAssertNil(failure)
    var stored: String?
    module.getIdentity({ stored = $0 as? String }, rejecter: reject)
    XCTAssertEqual(stored, identity)
    module.clearIdentity({ _ in }, rejecter: reject)
    var deleted: Any?
    module.getIdentity({ deleted = $0 }, rejecter: reject)
    XCTAssertNil(failure)
    XCTAssertNil(deleted)
  }

  func testOversizedIdentityIsRejectedWithoutReplacingStoredValue() {
    let module = AttruviNative()
    let identity = "{\"userId\":\"ios-native-test\",\"traits\":{}}"
    module.setIdentity(identity, resolver: { _ in }, rejecter: { _, _, _ in XCTFail("Unexpected storage failure") })
    var code: String?
    // 16,385 characters occupy 32,770 UTF-8 bytes: the limit is bytes, not characters.
    module.setIdentity(String(repeating: "é", count: 16_385), resolver: { _ in XCTFail("Oversized identity accepted") }, rejecter: { value, _, _ in code = value })
    XCTAssertEqual(code, "identity_too_large")
    module.getIdentity({ XCTAssertEqual($0 as? String, identity) }, rejecter: { _, _, _ in XCTFail("Unexpected storage failure") })
    module.clearIdentity({ _ in }, rejecter: { _, _, _ in XCTFail("Unexpected storage failure") })
  }

  func testIOSDoesNotInventInstallReferrerOrInitialLink() {
    let module = AttruviNative()
    let reject: RCTPromiseRejectBlock = { _, _, _ in XCTFail("Unexpected rejection") }
    module.getInstallReferrer({ XCTAssertNil($0) }, rejecter: reject)
    module.getInitialLink({ XCTAssertNil($0) }, rejecter: reject)
  }
}
