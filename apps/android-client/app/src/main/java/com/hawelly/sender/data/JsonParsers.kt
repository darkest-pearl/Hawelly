package com.hawelly.sender.data

import org.json.JSONArray
import org.json.JSONObject

internal fun JSONObject.nullableString(name: String): String? =
    if (!has(name) || isNull(name)) null else getString(name)

internal fun JSONObject.stringMap(): Map<String, String> = keys().asSequence().associateWith { key ->
    opt(key)?.toString().orEmpty()
}

internal fun JSONArray.objects(): List<JSONObject> = (0 until length()).map(::getJSONObject)

internal fun JSONArray.strings(): List<String> = (0 until length()).map(::getString)

internal fun parseUser(value: JSONObject) = User(
    id = value.getString("id"),
    fullName = value.getString("fullName"),
    email = value.getString("email"),
    role = value.getString("role"),
    status = value.getString("status")
)

internal fun parseSession(value: JSONObject) = SessionTokens(
    accessToken = value.getString("accessToken"),
    refreshToken = value.getString("refreshToken"),
    refreshExpiresAt = value.getString("refreshExpiresAt"),
    user = parseUser(value.getJSONObject("user"))
)

internal fun parseRecipient(value: JSONObject) = Recipient(
    id = value.getString("id"),
    fullName = value.getString("fullName"),
    country = value.getString("country"),
    phone = value.nullableString("phone"),
    payoutMethod = PayoutMethod.valueOf(value.getString("payoutMethod")),
    payoutDetails = value.getJSONObject("payoutDetails").stringMap(),
    address = value.nullableString("address")
)

internal fun parseTransferOptions(value: JSONObject) = SenderTransferOptions(
    configurationVersion = if (value.isNull("configurationVersion")) null else value.getInt("configurationVersion"),
    quoteSlaMinutes = value.getInt("quoteSlaMinutes"),
    corridors = value.getJSONArray("corridors").objects().map { corridor ->
        TransferCorridorOption(
            originCountry = corridor.getString("originCountry"),
            destinationCountry = corridor.getString("destinationCountry"),
            sendCurrencies = corridor.getJSONArray("sendCurrencies").strings(),
            receiveCurrencies = corridor.getJSONArray("receiveCurrencies").strings(),
            payoutMethods = corridor.getJSONArray("payoutMethods").strings()
                .map { PayoutMethod.valueOf(it) }
        )
    }
)

internal fun parseTransfer(value: JSONObject): Transfer {
    val recipient = value.optJSONObject("recipient")
    val timeline = value.optJSONArray("timeline")?.objects()?.map { event ->
        TimelineEvent(
            type = event.getString("type"),
            status = event.nullableString("status"),
            reason = event.nullableString("reason"),
            occurredAt = event.getString("occurredAt")
        )
    }.orEmpty()
    return Transfer(
        id = value.getString("id"),
        reference = value.getString("reference"),
        recipientId = value.getString("recipientId"),
        recipientName = recipient?.optString("fullName")?.takeIf(String::isNotBlank) ?: "Recipient",
        originCountry = value.getString("originCountry"),
        destinationCountry = value.getString("destinationCountry"),
        sendAmountMinor = value.getString("sendAmountMinor"),
        sendCurrency = value.getString("sendCurrency"),
        requestedPayoutMethod = PayoutMethod.valueOf(value.getString("requestedPayoutMethod")),
        status = value.getString("status"),
        quoteDueAt = value.getString("quoteDueAt"),
        senderNote = value.nullableString("senderNote"),
        createdAt = value.getString("createdAt"),
        timeline = timeline
    )
}

internal fun parseQuote(value: JSONObject) = Quote(
    id = value.getString("id"),
    version = value.getInt("version"),
    sendAmountMinor = value.getString("sendAmountMinor"),
    sendCurrency = value.getString("sendCurrency"),
    feeAmountMinor = value.getString("feeAmountMinor"),
    effectiveRate = value.getString("effectiveRate"),
    receiveAmountMinor = value.getString("receiveAmountMinor"),
    receiveCurrency = value.getString("receiveCurrency"),
    expectedDeliveryAt = value.getString("expectedDeliveryAt"),
    expiresAt = value.getString("expiresAt"),
    status = value.getString("status"),
    senderFacingNote = value.nullableString("senderFacingNote")
)

internal fun parseFunding(value: JSONObject): FundingState {
    val instruction = value.optJSONObject("instruction")?.let {
        FundingInstruction(
            method = it.getString("method"),
            amountMinor = it.getString("amountMinor"),
            currency = it.getString("currency"),
            payeeName = it.getString("payeeName"),
            provider = it.nullableString("provider"),
            accountReference = it.nullableString("accountReference"),
            senderReference = it.getString("senderReference"),
            instructions = it.getString("instructions"),
            validUntil = it.nullableString("validUntil")
        )
    }
    val proofs = value.getJSONArray("proofs").objects().map {
        FundingProof(
            id = it.getString("id"),
            reference = it.nullableString("reference"),
            status = it.getString("status"),
            hasAttachment = it.getBoolean("hasAttachment"),
            originalFilename = it.nullableString("originalFilename"),
            reviewReason = it.nullableString("reviewReason"),
            createdAt = it.getString("createdAt")
        )
    }
    return FundingState(value.getString("transferStatus"), instruction, proofs)
}

internal fun parsePayout(value: JSONObject): PayoutSummary? = value.optJSONObject("payout")?.let {
    PayoutSummary(
        status = it.getString("status"),
        amountMinor = it.getString("amountMinor"),
        currency = it.getString("currency"),
        payoutMethod = PayoutMethod.valueOf(it.getString("payoutMethod")),
        expectedBy = it.getString("expectedBy"),
        senderFacingNote = it.nullableString("senderFacingNote"),
        completedAt = it.nullableString("completedAt")
    )
}

internal fun parseResolution(value: JSONObject): ResolutionState {
    val confirmations = value.getJSONArray("confirmations").objects().map {
        Confirmation(it.getString("id"), it.getString("source"), it.nullableString("note"), it.getString("confirmedAt"))
    }
    val disputes = value.getJSONArray("disputes").objects().map {
        Dispute(
            id = it.getString("id"),
            category = it.getString("category"),
            previousTransferStatus = it.getString("previousTransferStatus"),
            status = it.getString("status"),
            resolutionAction = it.nullableString("resolutionAction"),
            openedAt = it.getString("openedAt"),
            resolvedAt = it.nullableString("resolvedAt")
        )
    }
    val refund = value.optJSONObject("refund")?.let {
        RefundSummary(
            id = it.getString("id"),
            amountMinor = it.getString("amountMinor"),
            currency = it.getString("currency"),
            status = it.getString("status"),
            senderFacingReason = it.getString("senderFacingReason"),
            initiatedAt = it.getString("initiatedAt"),
            refundedAt = it.nullableString("refundedAt")
        )
    }
    return ResolutionState(value.getString("transferStatus"), confirmations, disputes, refund)
}

internal fun parseUpdate(value: JSONObject) = UpdateMetadata(
    latestVersionCode = value.getInt("latestVersionCode"),
    latestVersionName = value.getString("latestVersionName"),
    minimumSupportedVersionCode = value.getInt("minimumSupportedVersionCode"),
    updateAvailable = value.getBoolean("updateAvailable"),
    updateRequired = value.getBoolean("updateRequired"),
    downloadUrl = value.nullableString("downloadUrl"),
    sha256 = value.nullableString("sha256"),
    releaseNotes = value.nullableString("releaseNotes")
)
