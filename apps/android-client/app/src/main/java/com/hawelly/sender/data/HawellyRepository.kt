package com.hawelly.sender.data

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.net.URLEncoder

class HawellyRepository(
    private val api: ApiClient,
    private val store: SecureSessionStore
) {
    private val refreshMutex = Mutex()
    @Volatile private var session: SessionTokens? = null

    suspend fun restore(): User? {
        val refreshToken = store.readRefreshToken() ?: return null
        return runCatching { refreshWith(refreshToken).user }.getOrElse {
            clearSession()
            null
        }
    }

    suspend fun login(email: String, password: String): User {
        val value = api.request(
            "POST",
            "/auth/login",
            body = JSONObject().put("email", email.trim()).put("password", password)
        )
        return acceptSession(parseSession(value)).user
    }

    suspend fun register(fullName: String, email: String, password: String): User {
        val value = api.request(
            "POST",
            "/auth/register",
            body = JSONObject()
                .put("fullName", fullName.trim())
                .put("email", email.trim())
                .put("password", password)
        )
        return acceptSession(parseSession(value)).user
    }

    suspend fun me(): User = parseUser(authenticated("GET", "/me"))

    suspend fun logout() {
        val refresh = store.readRefreshToken()
        runCatching {
            api.request("POST", "/auth/logout", body = JSONObject().apply {
                if (refresh != null) put("refreshToken", refresh)
            })
        }
        clearSession()
    }

    suspend fun logoutAll() {
        clearAfterConfirmedRevocation(
            revoke = {
                authenticated("POST", "/auth/logout-all", JSONObject())
                Unit
            },
            clear = ::clearSession
        )
    }

    suspend fun listRecipients(): List<Recipient> =
        authenticated("GET", "/recipients").getJSONArray("recipients").objects().map(::parseRecipient)

    suspend fun createRecipient(
        fullName: String,
        country: String,
        phone: String?,
        method: PayoutMethod,
        payoutDetails: Map<String, String>,
        address: String?
    ): Recipient {
        val body = JSONObject()
            .put("fullName", fullName.trim())
            .put("country", country.trim().uppercase())
            .put("payoutMethod", method.name)
            .put("payoutDetails", JSONObject(payoutDetails))
        phone?.trim()?.takeIf(String::isNotEmpty)?.let { body.put("phone", it) }
        address?.trim()?.takeIf(String::isNotEmpty)?.let { body.put("address", it) }
        return parseRecipient(authenticated("POST", "/recipients", body).getJSONObject("recipient"))
    }

    suspend fun updateRecipient(
        recipientId: String,
        fullName: String,
        country: String,
        phone: String?,
        method: PayoutMethod,
        payoutDetails: Map<String, String>,
        address: String?
    ): Recipient {
        val body = JSONObject()
            .put("fullName", fullName.trim())
            .put("country", country.trim().uppercase())
            .put("phone", phone?.trim()?.takeIf(String::isNotEmpty) ?: JSONObject.NULL)
            .put("payoutMethod", method.name)
            .put("payoutDetails", JSONObject(payoutDetails))
            .put("address", address?.trim()?.takeIf(String::isNotEmpty) ?: JSONObject.NULL)
        return parseRecipient(authenticated("PATCH", "/recipients/$recipientId", body).getJSONObject("recipient"))
    }

    suspend fun deleteRecipient(recipientId: String) {
        authenticated("DELETE", "/recipients/$recipientId")
    }

    suspend fun listTransfers(): List<Transfer> =
        authenticated("GET", "/transfers").getJSONArray("transfers").objects().map(::parseTransfer)

    suspend fun createTransfer(
        recipient: Recipient,
        originCountry: String,
        amountMinor: String,
        sendCurrency: String,
        senderNote: String?
    ): Transfer {
        val body = JSONObject()
            .put("recipientId", recipient.id)
            .put("originCountry", originCountry.trim().uppercase())
            .put("destinationCountry", recipient.country)
            .put("sendAmountMinor", amountMinor)
            .put("sendCurrency", sendCurrency.trim().uppercase())
            .put("requestedPayoutMethod", recipient.payoutMethod.name)
        senderNote?.trim()?.takeIf(String::isNotEmpty)?.let { body.put("senderNote", it) }
        return parseTransfer(authenticated("POST", "/transfers", body).getJSONObject("transfer"))
    }

    suspend fun transferBundle(transferId: String): TransferBundle = coroutineScope {
        val transfer = async { parseTransfer(authenticated("GET", "/transfers/$transferId")) }
        val quotes = async {
            authenticated("GET", "/transfers/$transferId/quotes")
                .getJSONArray("quotes").objects().map(::parseQuote)
        }
        val funding = async { parseFunding(authenticated("GET", "/transfers/$transferId/funding")) }
        val payout = async { parsePayout(authenticated("GET", "/transfers/$transferId/payout")) }
        val resolution = async { parseResolution(authenticated("GET", "/transfers/$transferId/resolution")) }
        TransferBundle(transfer.await(), quotes.await(), funding.await(), payout.await(), resolution.await())
    }

    suspend fun decideQuote(transferId: String, quoteId: String, decision: String, reason: String?) {
        val body = JSONObject().put("decision", decision)
        reason?.trim()?.takeIf(String::isNotEmpty)?.let { body.put("reason", it) }
        authenticated("POST", "/transfers/$transferId/quotes/$quoteId/decision", body)
    }

    suspend fun submitFundingProof(
        transferId: String,
        reference: String?,
        senderNote: String?,
        attachment: AttachmentUpload?
    ) {
        val body = JSONObject()
        reference?.trim()?.takeIf(String::isNotEmpty)?.let { body.put("reference", it) }
        senderNote?.trim()?.takeIf(String::isNotEmpty)?.let { body.put("senderNote", it) }
        if (attachment != null) {
            body.put(
                "attachment",
                JSONObject()
                    .put("filename", attachment.filename)
                    .put("contentType", attachment.contentType)
                    .put("sizeBytes", attachment.bytes.size)
            )
        }
        val response = authenticated("POST", "/transfers/$transferId/funding-proofs", body)
        val upload = response.optJSONObject("upload")
        if (upload != null && attachment != null) {
            api.upload(upload.getString("url"), upload.getString("contentType"), attachment.bytes)
        }
    }

    suspend fun confirmRecipientReceived(transferId: String, note: String?) {
        val body = JSONObject()
        note?.trim()?.takeIf(String::isNotEmpty)?.let { body.put("note", it) }
        authenticated("POST", "/transfers/$transferId/recipient-confirmation", body)
    }

    suspend fun openDispute(transferId: String, category: String, reason: String) {
        authenticated(
            "POST",
            "/transfers/$transferId/disputes",
            JSONObject().put("category", category.trim()).put("reason", reason.trim())
        )
    }

    suspend fun checkUpdate(versionCode: Int): UpdateMetadata = parseUpdate(
        api.request("GET", "/app-updates/android?versionCode=${encode(versionCode.toString())}")
    )

    private suspend fun authenticated(method: String, path: String, body: JSONObject? = null): JSONObject {
        val current = session ?: throw ApiException(401, "AUTH_REQUIRED", "Sign in required")
        return try {
            api.request(method, path, current.accessToken, body)
        } catch (error: ApiException) {
            if (error.status != 401) throw error
            val refreshed = refreshAfter(current.accessToken)
            api.request(method, path, refreshed.accessToken, body)
        }
    }

    private suspend fun refreshAfter(failedAccessToken: String): SessionTokens = refreshMutex.withLock {
        val current = session
        if (current != null && current.accessToken != failedAccessToken) return@withLock current
        val refreshToken = store.readRefreshToken()
            ?: throw ApiException(401, "INVALID_SESSION", "Your session has expired")
        try {
            refreshWith(refreshToken)
        } catch (error: Exception) {
            clearSession()
            throw error
        }
    }

    private suspend fun refreshWith(refreshToken: String): SessionTokens {
        val refreshed = parseSession(
            api.request(
                "POST",
                "/auth/refresh",
                body = JSONObject().put("refreshToken", refreshToken)
            )
        )
        return acceptSession(refreshed)
    }

    private fun acceptSession(value: SessionTokens): SessionTokens {
        require(value.user.role == "SENDER") { "The Android app supports sender accounts only" }
        store.writeRefreshToken(value.refreshToken)
        session = value
        return value
    }

    private fun clearSession() {
        session = null
        store.clear()
    }

    private fun encode(value: String) = URLEncoder.encode(value, Charsets.UTF_8.name())
}

internal suspend fun clearAfterConfirmedRevocation(
    revoke: suspend () -> Unit,
    clear: () -> Unit
) {
    revoke()
    clear()
}
