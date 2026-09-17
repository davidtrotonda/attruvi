import Foundation
import React
import Security

@objc(AttruviNative)
final class AttruviNative: NSObject {
  private let service = "com.attruvi.react-native"
  private let installationKey = "installation_id"
  private let anonymousKey = "anonymous_id"
  private let identityKey = "identity_json"

  @objc static func requiresMainQueueSetup() -> Bool {
    false
  }

  private func read(_ account: String) throws -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else {
      throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
    }
    return String(data: data, encoding: .utf8)
  }

  private func write(_ value: String, account: String) throws {
    let base: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(base as CFDictionary)
    var item = base
    item[kSecValueData as String] = Data(value.utf8)
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(item as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
    }
  }

  private func remove(_ account: String) throws {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
    }
  }

  private func identifiers(resetAnonymous: Bool = false) throws -> [String: String] {
    let installationId = try read(installationKey) ?? UUID().uuidString.lowercased()
    let anonymousId = resetAnonymous
      ? UUID().uuidString.lowercased()
      : (try read(anonymousKey) ?? UUID().uuidString.lowercased())
    try write(installationId, account: installationKey)
    try write(anonymousId, account: anonymousKey)
    return ["installationId": installationId, "anonymousId": anonymousId]
  }

  @objc(getOrCreateIdentifiers:rejecter:)
  func getOrCreateIdentifiers(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    do { resolve(try identifiers()) }
    catch { reject("secure_storage_error", error.localizedDescription, error) }
  }

  @objc(resetAnonymousId:rejecter:)
  func resetAnonymousId(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    do { resolve(try identifiers(resetAnonymous: true)) }
    catch { reject("secure_storage_error", error.localizedDescription, error) }
  }

  @objc(getIdentity:rejecter:)
  func getIdentity(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    do { resolve(try read(identityKey)) }
    catch { reject("secure_storage_error", error.localizedDescription, error) }
  }

  @objc(setIdentity:resolver:rejecter:)
  func setIdentity(
    _ identityJson: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard identityJson.utf8.count <= 32_768 else {
      reject("identity_too_large", "Identity exceeds 32 KB", nil)
      return
    }
    do {
      try write(identityJson, account: identityKey)
      resolve(nil)
    } catch {
      reject("secure_storage_error", error.localizedDescription, error)
    }
  }

  @objc(clearIdentity:rejecter:)
  func clearIdentity(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    do {
      try remove(identityKey)
      resolve(nil)
    } catch {
      reject("secure_storage_error", error.localizedDescription, error)
    }
  }

  @objc(getInstallReferrer:rejecter:)
  func getInstallReferrer(
    _ resolve: RCTPromiseResolveBlock,
    rejecter _: RCTPromiseRejectBlock
  ) {
    resolve(nil)
  }

  @objc(getInitialLink:rejecter:)
  func getInitialLink(
    _ resolve: RCTPromiseResolveBlock,
    rejecter _: RCTPromiseRejectBlock
  ) {
    // Linking.getInitialURL() es la fuente oficial en iOS; el puente evita inventar señales.
    resolve(nil)
  }
}
