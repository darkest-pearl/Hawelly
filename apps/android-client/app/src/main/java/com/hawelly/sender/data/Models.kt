package com.hawelly.sender.data

enum class PayoutMethod { BANK_TRANSFER, CASH_PICKUP, MOBILE_MONEY, OTHER }

data class User(
    val id: String,
    val fullName: String,
    val email: String,
    val role: String,
    val status: String
)

data class SessionTokens(
    val accessToken: String,
    val refreshToken: String,
    val refreshExpiresAt: String,
    val user: User
)

data class Recipient(
    val id: String,
    val fullName: String,
    val country: String,
    val phone: String?,
    val payoutMethod: PayoutMethod,
    val payoutDetails: Map<String, String>,
    val address: String?
)

data class TimelineEvent(
    val type: String,
    val status: String?,
    val reason: String?,
    val occurredAt: String
)

data class Transfer(
    val id: String,
    val reference: String,
    val recipientId: String,
    val recipientName: String,
    val originCountry: String,
    val destinationCountry: String,
    val sendAmountMinor: String,
    val sendCurrency: String,
    val requestedPayoutMethod: PayoutMethod,
    val status: String,
    val quoteDueAt: String,
    val senderNote: String?,
    val createdAt: String,
    val timeline: List<TimelineEvent> = emptyList()
)

data class Quote(
    val id: String,
    val version: Int,
    val sendAmountMinor: String,
    val sendCurrency: String,
    val feeAmountMinor: String,
    val effectiveRate: String,
    val receiveAmountMinor: String,
    val receiveCurrency: String,
    val expectedDeliveryAt: String,
    val expiresAt: String,
    val status: String,
    val senderFacingNote: String?
)

data class FundingInstruction(
    val method: String,
    val amountMinor: String,
    val currency: String,
    val payeeName: String,
    val provider: String?,
    val accountReference: String?,
    val senderReference: String,
    val instructions: String,
    val validUntil: String?
)

data class FundingProof(
    val id: String,
    val reference: String?,
    val status: String,
    val hasAttachment: Boolean,
    val originalFilename: String?,
    val reviewReason: String?,
    val createdAt: String
)

data class FundingState(
    val transferStatus: String,
    val instruction: FundingInstruction?,
    val proofs: List<FundingProof>
)

data class PayoutSummary(
    val status: String,
    val amountMinor: String,
    val currency: String,
    val payoutMethod: PayoutMethod,
    val expectedBy: String,
    val senderFacingNote: String?,
    val completedAt: String?
)

data class Confirmation(val id: String, val source: String, val note: String?, val confirmedAt: String)
data class Dispute(
    val id: String,
    val category: String,
    val previousTransferStatus: String,
    val status: String,
    val resolutionAction: String?,
    val openedAt: String,
    val resolvedAt: String?
)
data class RefundSummary(
    val id: String,
    val amountMinor: String,
    val currency: String,
    val status: String,
    val senderFacingReason: String,
    val initiatedAt: String,
    val refundedAt: String?
)
data class ResolutionState(
    val transferStatus: String,
    val confirmations: List<Confirmation>,
    val disputes: List<Dispute>,
    val refund: RefundSummary?
)

data class TransferBundle(
    val transfer: Transfer,
    val quotes: List<Quote>,
    val funding: FundingState,
    val payout: PayoutSummary?,
    val resolution: ResolutionState
)

data class UpdateMetadata(
    val latestVersionCode: Int,
    val latestVersionName: String,
    val minimumSupportedVersionCode: Int,
    val updateAvailable: Boolean,
    val updateRequired: Boolean,
    val downloadUrl: String?,
    val sha256: String?,
    val releaseNotes: String?
)

data class AttachmentUpload(
    val filename: String,
    val contentType: String,
    val bytes: ByteArray
)
