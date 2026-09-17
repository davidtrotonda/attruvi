package com.attruvi.reactnative

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

class AttruviNativeModule(
    private val context: ReactApplicationContext
) : ReactContextBaseJavaModule(context) {
    companion object {
        const val NAME = "AttruviNative"
        private const val PREFS = "attruvi_secure_storage"
        private const val INSTALLATION_ID = "installation_id"
        private const val ANONYMOUS_ID = "anonymous_id"
        private const val IDENTITY = "identity_json"
    }

    override fun getName(): String = NAME

    private val preferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private fun identifiers(resetAnonymous: Boolean = false) = Arguments.createMap().apply {
        val installationId = preferences.getString(INSTALLATION_ID, null) ?: UUID.randomUUID().toString()
        val anonymousId = if (resetAnonymous) {
            UUID.randomUUID().toString()
        } else {
            preferences.getString(ANONYMOUS_ID, null) ?: UUID.randomUUID().toString()
        }
        preferences.edit()
            .putString(INSTALLATION_ID, installationId)
            .putString(ANONYMOUS_ID, anonymousId)
            .apply()
        putString("installationId", installationId)
        putString("anonymousId", anonymousId)
    }

    @ReactMethod
    fun getOrCreateIdentifiers(promise: Promise) {
        runCatching { identifiers() }
            .onSuccess(promise::resolve)
            .onFailure { promise.reject("secure_storage_error", it.message, it) }
    }

    @ReactMethod
    fun resetAnonymousId(promise: Promise) {
        runCatching { identifiers(resetAnonymous = true) }
            .onSuccess(promise::resolve)
            .onFailure { promise.reject("secure_storage_error", it.message, it) }
    }

    @ReactMethod
    fun getIdentity(promise: Promise) {
        runCatching { preferences.getString(IDENTITY, null) }
            .onSuccess(promise::resolve)
            .onFailure { promise.reject("secure_storage_error", it.message, it) }
    }

    @ReactMethod
    fun setIdentity(identityJson: String, promise: Promise) {
        if (identityJson.length > 32_768) {
            promise.reject("identity_too_large", "Identity exceeds 32 KB")
            return
        }
        runCatching { preferences.edit().putString(IDENTITY, identityJson).commit() }
            .onSuccess { promise.resolve(null) }
            .onFailure { promise.reject("secure_storage_error", it.message, it) }
    }

    @ReactMethod
    fun clearIdentity(promise: Promise) {
        runCatching { preferences.edit().remove(IDENTITY).commit() }
            .onSuccess { promise.resolve(null) }
            .onFailure { promise.reject("secure_storage_error", it.message, it) }
    }

    @ReactMethod
    fun getInitialLink(promise: Promise) {
        promise.resolve(context.currentActivity?.intent?.dataString)
    }

    @ReactMethod
    fun getInstallReferrer(promise: Promise) {
        val client = InstallReferrerClient.newBuilder(context).build()
        val completed = AtomicBoolean(false)

        fun finish(value: Any?) {
            if (completed.compareAndSet(false, true)) {
                runCatching { client.endConnection() }
                promise.resolve(value)
            }
        }

        client.startConnection(object : InstallReferrerStateListener {
            override fun onInstallReferrerSetupFinished(responseCode: Int) {
                if (responseCode != InstallReferrerClient.InstallReferrerResponse.OK) {
                    finish(null)
                    return
                }
                runCatching {
                    val details = client.installReferrer
                    Arguments.createMap().apply {
                        putString("referrer", details.installReferrer)
                        putDouble("clickTimestampSeconds", details.referrerClickTimestampSeconds.toDouble())
                        putDouble("installTimestampSeconds", details.installBeginTimestampSeconds.toDouble())
                    }
                }.onSuccess(::finish).onFailure { finish(null) }
            }

            override fun onInstallReferrerServiceDisconnected() {
                finish(null)
            }
        })
    }
}
