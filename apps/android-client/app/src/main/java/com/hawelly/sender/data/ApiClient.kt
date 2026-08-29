package com.hawelly.sender.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.UUID

class ApiException(val status: Int, val code: String, override val message: String) : Exception(message)

class ApiClient(baseUrl: String) {
    private val origin = validatedOrigin(baseUrl)

    suspend fun request(
        method: String,
        path: String,
        accessToken: String? = null,
        body: JSONObject? = null
    ): JSONObject = withContext(Dispatchers.IO) {
        val connection = open(path, method, accessToken)
        try {
            if (body != null) {
                val bytes = body.toString().toByteArray(Charsets.UTF_8)
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.doOutput = true
                connection.setFixedLengthStreamingMode(bytes.size)
                connection.outputStream.use { it.write(bytes) }
            }
            readResponse(connection)
        } finally {
            connection.disconnect()
        }
    }

    suspend fun upload(url: String, contentType: String, bytes: ByteArray) = withContext(Dispatchers.IO) {
        val target = URL(url)
        if (target.protocol != "https" && !(target.protocol == "http" && target.host in setOf("10.0.2.2", "localhost", "127.0.0.1"))) {
            throw ApiException(0, "INVALID_UPLOAD_URL", "The evidence upload URL is not trusted")
        }
        val connection = target.openConnection() as HttpURLConnection
        connection.requestMethod = "PUT"
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        connection.setRequestProperty("Content-Type", contentType)
        connection.setRequestProperty("X-Client-Source", "ANDROID")
        connection.doOutput = true
        connection.setFixedLengthStreamingMode(bytes.size)
        try {
            connection.outputStream.use { it.write(bytes) }
            readResponse(connection)
        } finally {
            connection.disconnect()
        }
    }

    private fun open(path: String, method: String, accessToken: String?): HttpURLConnection {
        require(path.startsWith("/")) { "API paths must be absolute" }
        val connection = URL(origin + path).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("X-Client-Source", "ANDROID")
        connection.setRequestProperty("X-Request-Id", UUID.randomUUID().toString())
        if (accessToken != null) connection.setRequestProperty("Authorization", "Bearer $accessToken")
        return connection
    }

    private fun readResponse(connection: HttpURLConnection): JSONObject {
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.use { input ->
            ByteArrayOutputStream().use { output ->
                input.copyTo(output)
                output.toString(Charsets.UTF_8.name())
            }
        }.orEmpty()
        if (status !in 200..299) {
            val error = runCatching { JSONObject(text).optJSONObject("error") }.getOrNull()
            throw ApiException(
                status,
                error?.optString("code")?.takeIf(String::isNotBlank) ?: "HTTP_$status",
                error?.optString("message")?.takeIf(String::isNotBlank) ?: "Request failed"
            )
        }
        return if (text.isBlank()) JSONObject() else JSONObject(text)
    }

    companion object {
        internal fun validatedOrigin(value: String): String {
            val uri = runCatching { URI(value.trim()) }.getOrElse {
                throw IllegalArgumentException("API base URL must be a valid origin", it)
            }
            require(uri.scheme == "https" || (uri.scheme == "http" && uri.host in setOf("10.0.2.2", "localhost", "127.0.0.1"))) {
                "API base URL must use HTTPS or an emulator-local HTTP host"
            }
            require(!uri.host.isNullOrBlank()) { "API base URL must include a host" }
            require(uri.userInfo == null && uri.query == null && uri.fragment == null && (uri.path.isNullOrEmpty() || uri.path == "/")) {
                "API base URL must be an exact origin without credentials"
            }
            return "${uri.scheme}://${uri.authority}"
        }
    }
}
