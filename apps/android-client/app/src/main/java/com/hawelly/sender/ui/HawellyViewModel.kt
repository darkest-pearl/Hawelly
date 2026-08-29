package com.hawelly.sender.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hawelly.sender.BuildConfig
import com.hawelly.sender.data.ApiException
import com.hawelly.sender.data.AttachmentUpload
import com.hawelly.sender.data.HawellyRepository
import com.hawelly.sender.data.PayoutMethod
import com.hawelly.sender.data.Recipient
import com.hawelly.sender.data.Transfer
import com.hawelly.sender.data.TransferBundle
import com.hawelly.sender.data.UpdateMetadata
import com.hawelly.sender.data.User
import kotlinx.coroutines.launch

enum class AppScreen { DASHBOARD, RECIPIENTS, NEW_TRANSFER, TRANSFER_DETAIL, PROFILE }

data class HawellyUiState(
    val restoring: Boolean = true,
    val busy: Boolean = false,
    val user: User? = null,
    val screen: AppScreen = AppScreen.DASHBOARD,
    val transfers: List<Transfer> = emptyList(),
    val recipients: List<Recipient> = emptyList(),
    val selected: TransferBundle? = null,
    val update: UpdateMetadata? = null,
    val message: String? = null,
    val error: String? = null
)

class HawellyViewModel(private val repository: HawellyRepository) : ViewModel() {
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
            AppScreen.TRANSFER_DETAIL -> Unit
        }
    }

    fun refreshDashboard() = action { refreshDashboardInternal() }

    private suspend fun refreshDashboardInternal() {
        state.value = state.value.copy(transfers = repository.listTransfers())
    }

    fun refreshRecipients() = action {
        state.value = state.value.copy(recipients = repository.listRecipients())
    }

    fun saveRecipient(
        existingId: String?,
        fullName: String,
        country: String,
        phone: String?,
        method: PayoutMethod,
        payoutDetails: Map<String, String>,
        address: String?
    ) = action {
        if (existingId == null) {
            repository.createRecipient(fullName, country, phone, method, payoutDetails, address)
        } else {
            repository.updateRecipient(existingId, fullName, country, phone, method, payoutDetails, address)
        }
        state.value = state.value.copy(
            recipients = repository.listRecipients(),
            message = if (existingId == null) "Recipient added" else "Recipient updated"
        )
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
    ) = action {
        val transfer = repository.createTransfer(recipient, originCountry, amountMinor, currency, note)
        state.value = state.value.copy(
            transfers = repository.listTransfers(),
            screen = AppScreen.TRANSFER_DETAIL,
            selected = repository.transferBundle(transfer.id),
            message = "Transfer request submitted"
        )
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

    fun logout(allDevices: Boolean = false) = action {
        if (allDevices) repository.logoutAll() else repository.logout()
        state.value = HawellyUiState(restoring = false)
    }

    private suspend fun reloadSelected(transferId: String) {
        state.value = state.value.copy(selected = repository.transferBundle(transferId))
    }

    private fun action(showBusy: Boolean = true, block: suspend () -> Unit) {
        if (showBusy && state.value.busy) return
        viewModelScope.launch {
            state.value = state.value.copy(busy = showBusy, error = null, message = null)
            try {
                block()
            } catch (error: Exception) {
                val text = when (error) {
                    is ApiException -> error.message
                    else -> error.message ?: "Something went wrong"
                }
                state.value = if (error is ApiException && error.status == 401) {
                    HawellyUiState(restoring = false, error = "Your session expired. Sign in again.")
                } else {
                    state.value.copy(error = text)
                }
            } finally {
                state.value = state.value.copy(busy = false)
            }
        }
    }
}
