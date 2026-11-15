package dev.pleos.letspleo

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Development server transport. Network failure remains visible to the caller. */
class ServerApi(private val context: Context) {
    private val base = "http://10.0.2.2:4187"
    private val preferences = context.getSharedPreferences("lets_pleo_session", Context.MODE_PRIVATE)

    fun token(): String? = runCatching {
        val encrypted = preferences.getString("token_cipher", null)
        val iv = preferences.getString("token_iv", null)
        if (encrypted != null && iv != null) {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, deviceKey(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
            String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), Charsets.UTF_8)
        } else {
            val legacy = preferences.getString("device_token", null)
            if (legacy != null) saveToken(legacy)
            legacy
        }
    }.getOrNull()

    private fun deviceKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey("lets_pleo_device_token", null) as? SecretKey
        if (existing != null) return existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder("lets_pleo_device_token", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build())
        return generator.generateKey()
    }

    private fun saveToken(value: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, deviceKey())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        check(preferences.edit()
            .putString("token_cipher", Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString("token_iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .remove("device_token")
            .commit()) { "차량 연결 정보 저장 실패" }
    }

    fun pair(code: String): Result<String> = runCatching {
        val body = JSONObject().put("code", code.trim().uppercase())
        val response = try { post("/v1/pair", body, null) }
        catch (e: java.io.IOException) { error("네트워크에 연결할 수 없어요. 연결을 확인한 뒤 다시 시도해 주세요.") }
        val bearer = response.getString("token")
        saveToken(bearer)
        response.getString("deviceId")
    }

    fun collect(trip: JSONObject): Result<Map<String, Int>> = runCatching {
        val response = post("/v1/collections", trip, token() ?: error("차량 연결 필요"))
        check(response.getBoolean("confirmed"))
        val amounts = response.getJSONObject("materials")
        listOf("wood", "stone", "fabric", "seed").associateWith { amounts.getInt(it) }
    }

    fun submitTrip(trip: JSONObject): Result<JSONObject> = runCatching {
        val bearer = token() ?: error("차량 연결 필요")
        check(post("/v1/trips", trip, bearer).getBoolean("accepted"))
        request("/v1/trips/${trip.getString("id")}/receipt", null, bearer)
    }

    private fun post(path: String, body: JSONObject, bearer: String?) = request(path, body, bearer)

    private fun request(path: String, body: JSONObject?, bearer: String?): JSONObject {
        val connection = URL(base + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = if (body == null) "GET" else "POST"
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.setRequestProperty("Content-Type", "application/json")
            bearer?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                connection.doOutput = true
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
            val response = stream.bufferedReader().use { it.readText() }
            if (connection.responseCode !in 200..299) {
                val code = runCatching { JSONObject(response).optString("error") }.getOrDefault("")
                error(when (code) {
                    "CODE_UNAVAILABLE" -> "코드가 만료됐거나 이미 사용됐어요. 모바일에서 새 코드를 받아 주세요."
                    "INVALID_CODE" -> "모바일에 표시된 8자리 숫자를 다시 확인해 주세요."
                    "PAIR_RATE_LIMITED" -> "입력 횟수가 많아요. 10분 뒤 새 코드로 다시 시도해 주세요."
                    else -> "서버와 연결할 수 없어요. 잠시 뒤 다시 시도해 주세요."
                })
            }
            return JSONObject(response)
        } finally {
            connection.disconnect()
        }
    }
}
