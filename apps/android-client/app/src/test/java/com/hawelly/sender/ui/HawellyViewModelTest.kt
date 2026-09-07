package com.hawelly.sender.ui

import androidx.lifecycle.SavedStateHandle
import com.hawelly.sender.data.ApiException
import com.hawelly.sender.data.AttachmentUpload
import com.hawelly.sender.data.Confirmation
import com.hawelly.sender.data.Dispute
import com.hawelly.sender.data.FundingState
import com.hawelly.sender.data.HawellyDataSource
import com.hawelly.sender.data.PayoutMethod
import com.hawelly.sender.data.Quote
import com.hawelly.sender.data.Recipient
import com.hawelly.sender.data.RefundSummary
import com.hawelly.sender.data.ResolutionState
import com.hawelly.sender.data.SenderTransferOptions
import com.hawelly.sender.data.Transfer
import com.hawelly.sender.data.TransferBundle
import com.hawelly.sender.data.UpdateMetadata
import com.hawelly.sender.data.User
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class HawellyViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun rapidTapsCreateOneRequestAndShowTheCommittedReference() = runTest(dispatcher) {
        val gate = CompletableDeferred<Unit>()
        val fake = FakeDataSource().apply { createGate = gate }
        val model = HawellyViewModel(fake, SavedStateHandle())
        advanceUntilIdle()

        model.createTransfer(sampleRecipient, "AE", "10000", "AED", null)
        model.createTransfer(sampleRecipient, "AE", "10000", "AED", null)
        dispatcher.scheduler.runCurrent()
        assertEquals(1, fake.createTransferCalls)

        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(AppScreen.TRANSFER_CONFIRMATION, model.state.value.screen)
        assertEquals(sampleTransfer.reference, model.state.value.confirmedTransfer?.reference)
        assertFalse(model.state.value.error.orEmpty().contains("No value for id"))
    }

    @Test
    fun committedTransferSurvivesEverySecondaryRefreshFailure() = runTest(dispatcher) {
        val fake = FakeDataSource().apply {
            failTransferListAfterCreate = true
            transferBundleFailure = ApiException(503, "UNAVAILABLE", "Temporarily unavailable")
        }
        val model = HawellyViewModel(fake, SavedStateHandle())
        advanceUntilIdle()

        model.createTransfer(sampleRecipient, "AE", "10000", "AED", "Family support")
        advanceUntilIdle()

        assertEquals(AppScreen.TRANSFER_CONFIRMATION, model.state.value.screen)
        assertEquals(sampleTransfer.reference, model.state.value.confirmedTransfer?.reference)
        assertTrue(model.state.value.hydrationWarning.orEmpty().contains(sampleTransfer.reference))
        assertNull(model.state.value.error)
        assertEquals(listOf(sampleTransfer.id), model.state.value.transfers.map { it.id })
    }

    @Test
    fun explicitRetryAfterAmbiguousFailureReusesThePersistedKey() = runTest(dispatcher) {
        val savedState = SavedStateHandle()
        val firstFake = FakeDataSource().apply { createFailuresRemaining = 1 }
        val firstModel = HawellyViewModel(firstFake, savedState)
        advanceUntilIdle()

        firstModel.createTransfer(sampleRecipient, "AE", "10000", "AED", "Family support")
        advanceUntilIdle()
        assertEquals(1, firstFake.createTransferCalls)
        assertEquals("Something went wrong. Please try again.", firstModel.state.value.error)

        val restoredFake = FakeDataSource()
        val restoredModel = HawellyViewModel(restoredFake, savedState)
        advanceUntilIdle()
        restoredModel.createTransfer(sampleRecipient, "AE", "10000", "AED", "Family support")
        advanceUntilIdle()

        assertEquals(firstFake.idempotencyKeys.single(), restoredFake.idempotencyKeys.single())
        assertEquals(sampleTransfer.reference, restoredModel.state.value.confirmedTransfer?.reference)
    }

    @Test
    fun successfulRecipientSaveRemainsVisibleWhenListRefreshFails() = runTest(dispatcher) {
        val fake = FakeDataSource().apply { recipientListFailure = IOException("offline") }
        val model = HawellyViewModel(fake, SavedStateHandle())
        advanceUntilIdle()

        model.saveRecipient(
            null,
            sampleRecipient.fullName,
            sampleRecipient.country,
            null,
            sampleRecipient.payoutMethod,
            sampleRecipient.payoutDetails,
            null
        )
        advanceUntilIdle()

        assertEquals("Recipient added", model.state.value.message)
        assertEquals(1, model.state.value.recipientSaveSequence)
        assertEquals(sampleRecipient.id, model.state.value.recipients.single().id)
        assertNull(model.state.value.error)
    }

    @Test
    fun serverRecipientFieldErrorsRemainAvailableToTheOpenEditor() = runTest(dispatcher) {
        val fake = FakeDataSource().apply {
            recipientSaveFailure = ApiException(
                400,
                "VALIDATION_FAILED",
                "Check the highlighted fields",
                mapOf("phone" to "Use international format.")
            )
        }
        val model = HawellyViewModel(fake, SavedStateHandle())
        advanceUntilIdle()

        model.saveRecipient(
            null,
            sampleRecipient.fullName,
            sampleRecipient.country,
            "invalid",
            sampleRecipient.payoutMethod,
            sampleRecipient.payoutDetails,
            null
        )
        advanceUntilIdle()

        assertEquals("Use international format.", model.state.value.fieldErrors["phone"])
        assertEquals(0, model.state.value.recipientSaveSequence)
    }

    @Test
    fun passwordChangeClearsTheAndroidSessionAndReturnsToSignIn() = runTest(dispatcher) {
        val fake = FakeDataSource()
        val model = HawellyViewModel(fake, SavedStateHandle())
        advanceUntilIdle()

        model.changePassword("CorrectHorse123", "A-New-Secure-Password")
        advanceUntilIdle()

        assertTrue(fake.passwordChanged)
        assertNull(model.state.value.user)
        assertEquals("Password changed. Sign in again.", model.state.value.message)
    }
}

private open class FakeDataSource : HawellyDataSource {
    var createTransferCalls = 0
    var createFailuresRemaining = 0
    var createGate: CompletableDeferred<Unit>? = null
    var failTransferListAfterCreate = false
    var transferBundleFailure: Exception? = null
    var recipientListFailure: Exception? = null
    var recipientSaveFailure: Exception? = null
    var passwordChanged = false
    val idempotencyKeys = mutableListOf<String>()

    override suspend fun restore(): User? = null
    override suspend fun login(email: String, password: String) = sampleUser
    override suspend fun register(fullName: String, email: String, password: String) = sampleUser
    override suspend fun me() = sampleUser
    override suspend fun updateFullName(fullName: String) = sampleUser.copy(fullName = fullName)
    override suspend fun changePassword(currentPassword: String, newPassword: String) {
        passwordChanged = true
    }
    override suspend fun logout() = Unit
    override suspend fun logoutAll() = Unit
    override suspend fun listRecipients(): List<Recipient> {
        recipientListFailure?.let { throw it }
        return listOf(sampleRecipient)
    }
    override suspend fun transferOptions() = SenderTransferOptions(null, 30, emptyList())
    override suspend fun createRecipient(
        fullName: String,
        country: String,
        phone: String?,
        method: PayoutMethod,
        payoutDetails: Map<String, String>,
        address: String?
    ): Recipient {
        recipientSaveFailure?.let { throw it }
        return sampleRecipient.copy(
            fullName = fullName,
            country = country,
            phone = phone,
            payoutMethod = method,
            payoutDetails = payoutDetails,
            address = address
        )
    }
    override suspend fun updateRecipient(
        recipientId: String,
        fullName: String,
        country: String,
        phone: String?,
        method: PayoutMethod,
        payoutDetails: Map<String, String>,
        address: String?
    ) = createRecipient(fullName, country, phone, method, payoutDetails, address)
    override suspend fun deleteRecipient(recipientId: String) = Unit
    override suspend fun listTransfers(): List<Transfer> {
        if (failTransferListAfterCreate && createTransferCalls > 0) throw IOException("offline")
        return emptyList()
    }
    override suspend fun createTransfer(
        recipient: Recipient,
        originCountry: String,
        amountMinor: String,
        sendCurrency: String,
        senderNote: String?,
        idempotencyKey: String
    ): Transfer {
        createTransferCalls += 1
        idempotencyKeys += idempotencyKey
        createGate?.await()
        if (createFailuresRemaining > 0) {
            createFailuresRemaining -= 1
            throw IOException("response lost")
        }
        return sampleTransfer
    }
    override suspend fun transferBundle(transferId: String): TransferBundle {
        transferBundleFailure?.let { throw it }
        return sampleBundle
    }
    override suspend fun decideQuote(
        transferId: String,
        quoteId: String,
        decision: String,
        reason: String?
    ) = Unit
    override suspend fun submitFundingProof(
        transferId: String,
        reference: String?,
        senderNote: String?,
        attachment: AttachmentUpload?
    ) = Unit
    override suspend fun confirmRecipientReceived(transferId: String, note: String?) = Unit
    override suspend fun openDispute(transferId: String, category: String, reason: String) = Unit
    override suspend fun checkUpdate(versionCode: Int) = UpdateMetadata(
        3, "1.0.2-beta", 3, true, true, null, null, null
    )
}

private val sampleUser = User(
    "00000000-0000-4000-8000-000000000010",
    "Musab Mohammed Ibrahim",
    "sender@example.com",
    "SENDER",
    "ACTIVE"
)

private val sampleRecipient = Recipient(
    "00000000-0000-4000-8000-000000000020",
    "Amina M. Hassan",
    "EG",
    null,
    PayoutMethod.BANK_TRANSFER,
    mapOf(
        "accountName" to "Amina M. Hassan",
        "bankName" to "Example Bank",
        "accountNumber" to "123456"
    ),
    null
)

private val sampleTransfer = Transfer(
    "00000000-0000-4000-8000-000000000030",
    "HW-20260907-000000000001",
    sampleRecipient.id,
    sampleRecipient.fullName,
    "AE",
    "EG",
    "10000",
    "AED",
    PayoutMethod.BANK_TRANSFER,
    "REQUESTED",
    "2026-09-07T10:30:00.000Z",
    null,
    "2026-09-07T10:00:00.000Z"
)

private val sampleBundle = TransferBundle(
    sampleTransfer,
    emptyList<Quote>(),
    FundingState("REQUESTED", null, emptyList()),
    null,
    ResolutionState(
        "REQUESTED",
        emptyList<Confirmation>(),
        emptyList<Dispute>(),
        null as RefundSummary?
    )
)
