package com.hawelly.sender.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.hawelly.sender.BuildConfig
import com.hawelly.sender.data.ApiException
import com.hawelly.sender.data.AttachmentUpload
import com.hawelly.sender.data.HawellyDataSource
import com.hawelly.sender.data.PayoutMethod
import com.hawelly.sender.data.Recipient
import com.hawelly.sender.data.SenderTransferOptions
import com.hawelly.sender.data.Transfer
import com.hawelly.sender.data.TransferBundle
import com.hawelly.sender.data.UpdateMetadata
import com.hawelly.sender.data.User
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

enum class AppScreen {
    DASHBOARD,
    RECIPIENTS,
    NEW_TRANSFER,
    TRANSFER_CONFIRMATION,
    TRANSFER_DETAIL,
    PROFILE
}

data class HawellyUiState(
    val restoring: Boolean = true,
    val busy: Boolean = false,
    val user: User? = null,
    val screen: AppScreen = AppScreen.DASHBOARD,
    val transfers: List<Transfer> = emptyList(),
    val recipients: List<Recipient> = emptyList(),
    val transferOptions: SenderTransferOptions? = null,
    val selected: TransferBundle? = null,
    val confirmedTransfer: Transfer? = null,
    val hydrationWarning: String? = null,
    val update: UpdateMetadata? = null,
    val fieldErrors: Map<String, String> = emptyMap(),
    val recipientSaveSequence: Int = 0,
    val profileNameSaveSequence: Int = 0,
    val message: String? = null,
    val error: String? = null
)

class HawellyViewModel(
    private val repository: HawellyDataSource,
    private val savedStateHandle: SavedStateHandle = SavedStateHandle()
) : ViewModel() {
    private val transferSubmissionInFlight = AtomicBoolean(false)

    var state = androidx.compose.runtime.mutableStateOf(HawellyUiState())
        private set

    init {
        viewModelScope.launch {
            val user = repository.restore()
            state.value = state.value.copy(restoring = false, user = user)
            if (user != null) refreshDashboard()
        }
    }

    fun clearNotice() {
        state.value = state.value.copy(message = null, error = null)
    }

    fun login(email: String, password: String) = action {
        val user = repository.login(email, password)
        state.value = state.value.copy(user = user, screen = AppScreen.DASHBOARD)
        refreshDashboardInternal()
    }

    fun register(fullName: String, email: String, password: String) = action {
        val user = repository.register(fullName, email, password)
        state.value = state.value.copy(user = user, screen = AppScreen.DASHBOARD)
        refreshDashboardInternal()
    }

    fun navigate(screen: AppScreen) {
        state.value = state.value.copy(screen = screen, error = null, message = null)
        when (screen) {
            AppScreen.DASHBOARD -> refreshDashboard()
            AppScreen.RECIPIENTS, AppScreen.NEW_TRANSFER -> refreshRecipients()
            AppScreen.PROFILE -> checkUpdate()
            AppScreen.TRANSFER_CONFIRMATION, AppScreen.TRANSFER_DETAIL -> Unit
        }
    }

    fun refreshDashboard() = action { refreshDashboardInternal() }

    private suspend fun refreshDashboardInternal() {
        state.value = state.value.copy(transfers = repository.listTransfers())
    }

    fun refreshRecipients() = action {
        coroutineScope {
            val recipients = async { repository.listRecipients() }
            val options = async { repository.transferOptions() }
            state.value = state.value.copy(
                recipients = recipients.await(),
                transferOptions = options.await()
            )
        }
    }

    fun saveRecipient(
        existingId: String?,
        fullName: String,
        country: String,
        phone: String?,
        method: PayoutMethod,
        payoutDetails: Map<String, String>,
        address: String?
    ) {
        if (state.value.busy) return
        state.value = state.value.copy(
            busy = true,
            error = null,
            message = null,
            fieldErrors = emptyMap()
        )
        viewModelScope.launch {
            try {
                val saved = if (existingId == null) {
            repository.createRecipient(fullName, country, phone, method, payoutDetails, address)
        } else {
            repository.updateRecipient(existingId, fullName, country, phone, method, payoutDetails, address)
        }
                val current = state.value.recipients
                    .filterNot { it.id == saved.id }
                    .toMutableList()
                    .apply { add(0, saved) }
                val confirmation = if (existingId == null) "Recipient added" else "Recipient updated"
                state.value = state.value.copy(
                    busy = false,
                    recipients = current,
                    recipientSaveSequence = state.value.recipientSaveSequence + 1,
                    message = confirmation,
                    fieldErrors = emptyMap()
                )
                runCatching { repository.listRecipients() }.getOrNull()?.let { refreshed ->
                    state.value = state.value.copy(recipients = refreshed)
                }
            } catch (error: Exception) {
                state.value = failureState(error).copy(busy = false)
            }
        }
    }

    fun deleteRecipient(recipientId: String) = action {
        repository.deleteRecipient(recipientId)
        state.value = state.value.copy(
            recipients = repository.listRecipients(),
            message = "Recipient deleted"
        )
    }

    fun createTransfer(
        recipient: Recipient,
        originCountry: String,
        amountMinor: String,
        currency: String,
        note: String?
    ) {
        if (!transferSubmissionInFlight.compareAndSet(false, true)) return
        val fingerprint = submissionFingerprint(
            recipient,
            originCountry,
            amountMinor,
            currency,
            note
        )
        val idempotencyKey = submissionKeyFor(fingerprint)
        state.value = state.value.copy(
            busy = true,
            error = null,
            message = null,
            fieldErrors = emptyMap()
        )
        viewModelScope.launch {
            try {
                val transfer = repository.createTransfer(
                    recipient,
                    originCountry,
                    amountMinor,
                    currency,
                    note,
                    idempotencyKey
                )
                clearPendingSubmission()
                state.value = state.value.copy(
                    busy = false,
                    screen = AppScreen.TRANSFER_CONFIRMATION,
                    confirmedTransfer = transfer,
                    selected = null,
                    hydrationWarning = null,
                    transfers = listOf(transfer) + state.value.transfers.filterNot { it.id == transfer.id }
                )
                transferSubmissionInFlight.set(false)
                launch { hydrateConfirmedTransfer(transfer) }
            } catch (error: Exception) {
                if (error is ApiException && error.status in 400..499) {
                    clearPendingSubmission()
                }
                state.value = failureState(error).copy(busy = false)
                transferSubmissionInFlight.set(false)
            }
        }
    }

    fun viewConfirmedTransfer() {
        val confirmed = state.value.confirmedTransfer ?: return
        if (state.value.selected?.transfer?.id == confirmed.id) {
            state.value = state.value.copy(screen = AppScreen.TRANSFER_DETAIL)
        } else {
            openTransfer(confirmed.id)
        }
    }

    fun finishTransferConfirmation() {
        state.value = state.value.copy(
            screen = AppScreen.DASHBOARD,
            confirmedTransfer = null,
            hydrationWarning = null,
            selected = null,
            error = null
        )
    }

    fun retryConfirmedTransferHydration() {
        val confirmed = state.value.confirmedTransfer ?: return
        viewModelScope.launch { hydrateConfirmedTransfer(confirmed) }
    }

    fun openTransfer(transferId: String) = action {
        state.value = state.value.copy(
            screen = AppScreen.TRANSFER_DETAIL,
            selected = repository.transferBundle(transferId)
        )
    }

    fun decideQuote(decision: String, reason: String?) = action {
        val selected = state.value.selected ?: return@action
        val quote = selected.quotes.firstOrNull { it.status == "SENT" }
            ?: throw IllegalStateException("No active quote")
        repository.decideQuote(selected.transfer.id, quote.id, decision, reason)
        reloadSelected(selected.transfer.id)
        state.value = state.value.copy(message = if (decision == "ACCEPT") "Quote accepted" else "Quote declined")
    }

    fun submitFundingProof(reference: String?, note: String?, attachment: AttachmentUpload?) = action {
        val transferId = state.value.selected?.transfer?.id ?: return@action
        repository.submitFundingProof(transferId, reference, note, attachment)
        reloadSelected(transferId)
        state.value = state.value.copy(message = "Funding proof submitted")
    }

    fun confirmRecipientReceived(note: String?) = action {
        val transferId = state.value.selected?.transfer?.id ?: return@action
        repository.confirmRecipientReceived(transferId, note)
        reloadSelected(transferId)
        state.value = state.value.copy(message = "Recipient confirmation recorded")
    }

    fun openDispute(category: String, reason: String) = action {
        val transferId = state.value.selected?.transfer?.id ?: return@action
        repository.openDispute(transferId, category, reason)
        reloadSelected(transferId)
        state.value = state.value.copy(message = "Dispute opened")
    }

    fun checkUpdate() = action(showBusy = false) {
        state.value = state.value.copy(update = repository.checkUpdate(BuildConfig.VERSION_CODE))
    }

    fun updateFullName(fullName: String) = action {
        val user = repository.updateFullName(fullName)
        state.value = state.value.copy(
            user = user,
            profileNameSaveSequence = state.value.profileNameSaveSequence + 1,
            message = "Full name updated"
        )
    }

    fun notify(message: String) {
        state.value = state.value.copy(message = message)
    }

    fun changePassword(currentPassword: String, newPassword: String) {
        if (state.value.busy) return
        state.value = state.value.copy(busy = true, error = null, message = null)
        viewModelScope.launch {
            try {
                repository.changePassword(currentPassword, newPassword)
                state.value = HawellyUiState(
                    restoring = false,
                    message = "Password changed. Sign in again."
                )
            } catch (error: Exception) {
                state.value = failureState(error).copy(busy = false)
            }
        }
    }

    fun logout(allDevices: Boolean = false) = action {
        if (allDevices) repository.logoutAll() else repository.logout()
        state.value = HawellyUiState(restoring = false)
    }

    private suspend fun reloadSelected(transferId: String) {
        state.value = state.value.copy(selected = repository.transferBundle(transferId))
    }

    private suspend fun hydrateConfirmedTransfer(transfer: Transfer) = supervisorScope {
        val transfers = async { runCatching { repository.listTransfers() } }
        val bundle = async { runCatching { repository.transferBundle(transfer.id) } }
        val refreshedTransfers = transfers.await()
        val refreshedBundle = bundle.await()
        if (state.value.confirmedTransfer?.id != transfer.id) return@supervisorScope
        val failed = refreshedTransfers.isFailure || refreshedBundle.isFailure
        state.value = state.value.copy(
            transfers = refreshedTransfers.getOrNull() ?: state.value.transfers,
            selected = refreshedBundle.getOrNull() ?: state.value.selected,
            hydrationWarning = if (failed) {
                "Transfer request ${transfer.reference} was submitted, but its latest details could not be refreshed. Try refreshing the request."
            } else null
        )
    }

    private fun submissionKeyFor(fingerprint: String): String {
        val savedFingerprint = savedStateHandle.get<String>(PENDING_TRANSFER_FINGERPRINT)
        val savedKey = savedStateHandle.get<String>(PENDING_TRANSFER_KEY)
        if (savedFingerprint == fingerprint && savedKey != null) return savedKey
        return UUID.randomUUID().toString().also { key ->
            savedStateHandle[PENDING_TRANSFER_FINGERPRINT] = fingerprint
            savedStateHandle[PENDING_TRANSFER_KEY] = key
        }
    }

    private fun clearPendingSubmission() {
        savedStateHandle.remove<String>(PENDING_TRANSFER_FINGERPRINT)
        savedStateHandle.remove<String>(PENDING_TRANSFER_KEY)
    }

    private fun submissionFingerprint(
        recipient: Recipient,
        originCountry: String,
        amountMinor: String,
        currency: String,
        note: String?
    ): String {
        val canonical = listOf(
            recipient.id,
            recipient.country,
            recipient.payoutMethod.name,
            originCountry.trim().uppercase(),
            amountMinor,
            currency.trim().uppercase(),
            note?.trim().orEmpty()
        ).joinToString("\u0000")
        return MessageDigest.getInstance("SHA-256")
            .digest(canonical.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    private fun failureState(error: Exception): HawellyUiState {
        if (error is ApiException && error.status == 401) {
            return HawellyUiState(
                restoring = false,
                error = "Your session expired. Sign in again."
            )
        }
        val message = if (error is ApiException) {
            error.message
        } else {
            "Something went wrong. Please try again."
        }
        return state.value.copy(
            error = message,
            fieldErrors = (error as? ApiException)?.fieldErrors.orEmpty()
        )
    }

    private fun action(showBusy: Boolean = true, block: suspend () -> Unit) {
        if (showBusy && state.value.busy) return
        viewModelScope.launch {
            state.value = state.value.copy(
                busy = if (showBusy) true else state.value.busy,
                error = null,
                message = null,
                fieldErrors = emptyMap()
            )
            try {
                block()
            } catch (error: Exception) {
                state.value = failureState(error)
            } finally {
                if (showBusy) {
                    state.value = state.value.copy(busy = false)
                }
            }
        }
    }

    private companion object {
        const val PENDING_TRANSFER_KEY = "pending_transfer_idempotency_key"
        const val PENDING_TRANSFER_FINGERPRINT = "pending_transfer_fingerprint"
    }
}
