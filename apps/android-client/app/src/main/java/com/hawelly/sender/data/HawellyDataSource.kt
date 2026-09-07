package com.hawelly.sender.data

interface HawellyDataSource {
    suspend fun restore(): User?
    suspend fun login(email: String, password: String): User
    suspend fun register(fullName: String, email: String, password: String): User
    suspend fun me(): User
    suspend fun updateFullName(fullName: String): User
    suspend fun changePassword(currentPassword: String, newPassword: String)
    suspend fun logout()
    suspend fun logoutAll()
    suspend fun listRecipients(): List<Recipient>
    suspend fun transferOptions(): SenderTransferOptions
    suspend fun createRecipient(
        fullName: String,
        country: String,
        phone: String?,
        method: PayoutMethod,
        payoutDetails: Map<String, String>,
        address: String?
    ): Recipient
    suspend fun updateRecipient(
        recipientId: String,
        fullName: String,
        country: String,
        phone: String?,
        method: PayoutMethod,
        payoutDetails: Map<String, String>,
        address: String?
    ): Recipient
    suspend fun deleteRecipient(recipientId: String)
    suspend fun listTransfers(): List<Transfer>
    suspend fun createTransfer(
        recipient: Recipient,
        originCountry: String,
        amountMinor: String,
        sendCurrency: String,
        senderNote: String?,
        idempotencyKey: String
    ): Transfer
    suspend fun transferBundle(transferId: String): TransferBundle
    suspend fun decideQuote(transferId: String, quoteId: String, decision: String, reason: String?)
    suspend fun submitFundingProof(
        transferId: String,
        reference: String?,
        senderNote: String?,
        attachment: AttachmentUpload?
    )
    suspend fun confirmRecipientReceived(transferId: String, note: String?)
    suspend fun openDispute(transferId: String, category: String, reason: String)
    suspend fun checkUpdate(versionCode: Int): UpdateMetadata
}
