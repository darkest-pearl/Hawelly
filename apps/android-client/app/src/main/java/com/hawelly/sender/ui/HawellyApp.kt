package com.hawelly.sender.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.hawelly.sender.R
import com.hawelly.sender.data.AttachmentUpload
import com.hawelly.sender.data.PayoutMethod
import com.hawelly.sender.data.Recipient
import com.hawelly.sender.data.Transfer
import com.hawelly.sender.data.TransferBundle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.math.RoundingMode

@Composable
fun HawellyApp(viewModel: HawellyViewModel) {
    HawellyTheme {
        val state by viewModel.state
        when {
            state.restoring -> LoadingScreen()
            state.user == null -> AuthScreen(state.busy, state.error, viewModel::login, viewModel::register)
            else -> SenderShell(state, viewModel)
        }
    }
}

@Composable
private fun LoadingScreen() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Hawelly", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(20.dp))
            CircularProgressIndicator()
            Spacer(Modifier.height(12.dp))
            Text("Restoring your secure session")
        }
    }
}

@Composable
private fun AuthScreen(
    busy: Boolean,
    error: String?,
    login: (String, String) -> Unit,
    register: (String, String, String) -> Unit
) {
    var createAccount by remember { mutableStateOf(false) }
    var fullName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var validation by remember { mutableStateOf<String?>(null) }
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(
            Modifier.fillMaxWidth().widthIn(max = 480.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            HawellyBrand()
            Spacer(Modifier.height(16.dp))
            Text(
                if (createAccount) "Create your sender account" else "Welcome back",
                style = MaterialTheme.typography.headlineLarge
            )
            Text(
                "One clear path from transfer request to recipient confirmation.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyLarge
            )
            Spacer(Modifier.height(6.dp))
            if (createAccount) {
                OutlinedTextField(
                    fullName,
                    { fullName = it; validation = null },
                    Modifier.fillMaxWidth(),
                    label = { Text("Full name") },
                    singleLine = true
                )
            }
            OutlinedTextField(
                email,
                { email = it; validation = null },
                Modifier.fillMaxWidth(),
                label = { Text("Email") },
                singleLine = true
            )
            OutlinedTextField(
                password,
                { password = it; validation = null },
                Modifier.fillMaxWidth(),
                label = { Text(if (createAccount) "Password (12+ characters)" else "Password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation()
            )
            (validation ?: error)?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = {
                    validation = when {
                        createAccount && fullName.isBlank() -> "Enter the sender's full name."
                        !email.contains('@') -> "Enter a complete email address, such as name@example.com."
                        createAccount && password.length < 12 -> "Use at least 12 characters for the password."
                        password.isBlank() -> "Enter your password."
                        else -> null
                    }
                    if (validation == null) {
                        if (createAccount) register(fullName, email, password) else login(email, password)
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth()
            ) { Text(if (busy) "Please wait…" else if (createAccount) "Create account" else "Sign in") }
            TextButton(
                onClick = { createAccount = !createAccount; validation = null },
                modifier = Modifier.align(Alignment.CenterHorizontally)
            ) {
                Text(if (createAccount) "Already have an account? Sign in" else "New to Hawelly? Create account")
            }
        }
    }
}

@Composable
private fun HawellyBrand() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Canvas(Modifier.width(42.dp).height(28.dp)) {
            val middle = size.height / 2f
            drawLine(
                brush = Brush.horizontalGradient(
                    listOf(Color(0xFF007C9E), Color(0xFF5AC8D8))
                ),
                start = Offset(7.dp.toPx(), middle),
                end = Offset(size.width - 7.dp.toPx(), middle),
                strokeWidth = 3.dp.toPx()
            )
            drawCircle(Color(0xFF007C9E), 6.dp.toPx(), Offset(7.dp.toPx(), middle))
            drawCircle(Color(0xFF5AC8D8), 6.dp.toPx(), Offset(size.width - 7.dp.toPx(), middle))
        }
        Text("Hawelly", style = MaterialTheme.typography.headlineMedium)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SenderShell(state: HawellyUiState, viewModel: HawellyViewModel) {
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.message, state.error) {
        (state.error ?: state.message)?.let {
            snackbar.showSnackbar(it)
            viewModel.clearNotice()
        }
    }
    val title = when (state.screen) {
        AppScreen.DASHBOARD -> "Transfers"
        AppScreen.RECIPIENTS -> "Recipients"
        AppScreen.NEW_TRANSFER -> "New transfer"
        AppScreen.TRANSFER_DETAIL -> state.selected?.transfer?.reference ?: "Transfer"
        AppScreen.PROFILE -> "Profile & security"
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title, fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    if (state.screen == AppScreen.TRANSFER_DETAIL || state.screen == AppScreen.NEW_TRANSFER) {
                        TextButton(onClick = { viewModel.navigate(AppScreen.DASHBOARD) }) { Text("Back") }
                    }
                },
                actions = { Text("Hawelly", modifier = Modifier.padding(end = 16.dp), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold) }
            )
        },
        bottomBar = {
            if (state.screen != AppScreen.TRANSFER_DETAIL && state.screen != AppScreen.NEW_TRANSFER) {
                NavigationBar {
                    listOf(
                        Triple(AppScreen.DASHBOARD, "Transfers", R.drawable.ic_transfers),
                        Triple(AppScreen.RECIPIENTS, "Recipients", R.drawable.ic_recipients),
                        Triple(AppScreen.PROFILE, "Profile", R.drawable.ic_profile)
                    ).forEach { (screen, label, icon) ->
                        NavigationBarItem(
                            selected = state.screen == screen,
                            onClick = { viewModel.navigate(screen) },
                            icon = { Icon(painterResource(icon), contentDescription = null) },
                            label = { Text(label) }
                        )
                    }
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (state.screen) {
                AppScreen.DASHBOARD -> DashboardScreen(state, viewModel)
                AppScreen.RECIPIENTS -> RecipientsScreen(state, viewModel)
                AppScreen.NEW_TRANSFER -> NewTransferScreen(state, viewModel)
                AppScreen.TRANSFER_DETAIL -> TransferDetailScreen(state, viewModel)
                AppScreen.PROFILE -> ProfileScreen(state, viewModel)
            }
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter))
        }
    }
}

@Composable
private fun DashboardScreen(state: HawellyUiState, viewModel: HawellyViewModel) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("Hello, ${state.user?.fullName?.substringBefore(' ')}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("Track every step from request to recipient confirmation.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            Button(onClick = { viewModel.navigate(AppScreen.NEW_TRANSFER) }, modifier = Modifier.fillMaxWidth()) { Text("Request a transfer") }
        }
        if (state.transfers.isEmpty()) {
            item { EmptyCard("No transfers yet", "Create your first transfer request when you are ready.") }
        } else {
            item { Text("Recent transfers", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column {
                        state.transfers.forEachIndexed { index, transfer ->
                            if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
                            TransferRow(transfer) { viewModel.openTransfer(transfer.id) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TransferRow(transfer: Transfer, open: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clickable(onClick = open).padding(horizontal = 18.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(transfer.reference, fontWeight = FontWeight.Bold)
            StatusText(transfer.status)
        }
        Text("${transfer.recipientName} · ${transfer.originCountry} → ${transfer.destinationCountry}")
        Text("${money(transfer.sendAmountMinor)} ${transfer.sendCurrency}", style = MaterialTheme.typography.titleMedium)
        Text("Requested ${friendlyDate(transfer.createdAt)}", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun RecipientsScreen(state: HawellyUiState, viewModel: HawellyViewModel) {
    var editing by remember { mutableStateOf<Recipient?>(null) }
    var deleting by remember { mutableStateOf<Recipient?>(null) }
    var editorOpen by remember { mutableStateOf(false) }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("Your recipients", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("Recipient payout details stay linked to your account.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(14.dp))
            Button(onClick = { editing = null; editorOpen = true }, modifier = Modifier.fillMaxWidth()) { Text("Add recipient") }
        }
        if (state.recipients.isEmpty()) item { EmptyCard("No recipients", "Add a recipient before requesting a transfer.") }
        if (state.recipients.isNotEmpty()) item {
            Card(Modifier.fillMaxWidth()) {
                Column {
                    state.recipients.forEachIndexed { index, recipient ->
                        if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
                        Column(Modifier.padding(horizontal = 18.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(recipient.fullName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text("${recipient.country} · ${words(recipient.payoutMethod.name)}")
                            recipient.phone?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = { editing = recipient; editorOpen = true }) { Text("Edit") }
                                TextButton(onClick = { deleting = recipient }) {
                                    Text("Delete", color = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if (editorOpen) {
        RecipientEditor(
            existing = editing,
            busy = state.busy,
            close = { editorOpen = false },
            save = { id, name, country, phone, method, details, address ->
                viewModel.saveRecipient(id, name, country, phone, method, details, address)
                editorOpen = false
            }
        )
    }
    deleting?.let { recipient ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("Delete ${recipient.fullName}?") },
            text = { Text("This removes the saved recipient. Existing transfer records remain unchanged.") },
            confirmButton = {
                Button(onClick = { deleting = null }) { Text("Keep recipient") }
            },
            dismissButton = {
                TextButton(onClick = {
                    deleting = null
                    viewModel.deleteRecipient(recipient.id)
                }) { Text("Delete recipient", color = MaterialTheme.colorScheme.error) }
            }
        )
    }
}

@Composable
private fun RecipientEditor(
    existing: Recipient?,
    busy: Boolean,
    close: () -> Unit,
    save: (String?, String, String, String?, PayoutMethod, Map<String, String>, String?) -> Unit
) {
    var name by remember(existing) { mutableStateOf(existing?.fullName.orEmpty()) }
    var country by remember(existing) { mutableStateOf(existing?.country ?: "PH") }
    var phone by remember(existing) { mutableStateOf(existing?.phone.orEmpty()) }
    var address by remember(existing) { mutableStateOf(existing?.address.orEmpty()) }
    var method by remember(existing) { mutableStateOf(existing?.payoutMethod ?: PayoutMethod.BANK_TRANSFER) }
    var detailOne by remember(existing) { mutableStateOf(existing?.let(::firstPayoutDetail).orEmpty()) }
    var detailTwo by remember(existing) { mutableStateOf(existing?.let(::secondPayoutDetail).orEmpty()) }
    var detailThree by remember(existing) { mutableStateOf(existing?.payoutDetails?.get("accountNumber").orEmpty()) }
    val labels = when (method) {
        PayoutMethod.BANK_TRANSFER -> listOf("Account name", "Bank name", "Account number")
        PayoutMethod.CASH_PICKUP -> listOf("Pickup city")
        PayoutMethod.MOBILE_MONEY -> listOf("Provider", "Account number")
        PayoutMethod.OTHER -> listOf("Instructions")
    }
    AlertDialog(
        onDismissRequest = close,
        title = { Text(if (existing == null) "Add recipient" else "Edit recipient") },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { OutlinedTextField(name, { name = it }, label = { Text("Full name") }, modifier = Modifier.fillMaxWidth()) }
                item { OutlinedTextField(country, { country = it.take(2) }, label = { Text("Country code") }, modifier = Modifier.fillMaxWidth()) }
                item { OutlinedTextField(phone, { phone = it }, label = { Text("Phone (optional)") }, modifier = Modifier.fillMaxWidth()) }
                item {
                    Text("Payout method", fontWeight = FontWeight.SemiBold)
                    PayoutMethod.entries.forEach { option ->
                        Row(Modifier.fillMaxWidth().clickable { method = option }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(method == option, { method = option })
                            Text(words(option.name))
                        }
                    }
                }
                item { OutlinedTextField(detailOne, { detailOne = it }, label = { Text(labels[0]) }, modifier = Modifier.fillMaxWidth()) }
                if (labels.size > 1) item { OutlinedTextField(detailTwo, { detailTwo = it }, label = { Text(labels[1]) }, modifier = Modifier.fillMaxWidth()) }
                if (labels.size > 2) item { OutlinedTextField(detailThree, { detailThree = it }, label = { Text(labels[2]) }, modifier = Modifier.fillMaxWidth()) }
                item { OutlinedTextField(address, { address = it }, label = { Text("Address (optional)") }, modifier = Modifier.fillMaxWidth()) }
            }
        },
        confirmButton = {
            Button(
                enabled = !busy && name.isNotBlank() && country.length == 2 && detailOne.isNotBlank(),
                onClick = {
                    val details = when (method) {
                        PayoutMethod.BANK_TRANSFER -> mapOf("accountName" to detailOne, "bankName" to detailTwo, "accountNumber" to detailThree)
                        PayoutMethod.CASH_PICKUP -> mapOf("city" to detailOne)
                        PayoutMethod.MOBILE_MONEY -> mapOf("provider" to detailOne, "accountNumber" to detailTwo)
                        PayoutMethod.OTHER -> mapOf("instructions" to detailOne)
                    }
                    save(existing?.id, name, country, phone, method, details, address)
                }
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = close) { Text("Cancel") } }
    )
}

@Composable
private fun NewTransferScreen(state: HawellyUiState, viewModel: HawellyViewModel) {
    var selectedId by remember { mutableStateOf(state.recipients.firstOrNull()?.id) }
    var origin by remember { mutableStateOf("AE") }
    var amount by remember { mutableStateOf("") }
    var currency by remember { mutableStateOf("AED") }
    var note by remember { mutableStateOf("") }
    val recipient = state.recipients.firstOrNull { it.id == selectedId }
    val minor = amountToMinor(amount)
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Text("Request a transfer", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("Staff will review your request and prepare a quote.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (state.recipients.isEmpty()) {
            item {
                EmptyCard("Add a recipient first", "A saved recipient is required for a transfer request.")
                Button(onClick = { viewModel.navigate(AppScreen.RECIPIENTS) }, modifier = Modifier.fillMaxWidth()) { Text("Manage recipients") }
            }
        } else {
            item { Text("Recipient", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
            items(state.recipients, key = { it.id }) { item ->
                Row(Modifier.fillMaxWidth().clickable { selectedId = item.id }.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selectedId == item.id, { selectedId = item.id })
                    Column { Text(item.fullName, fontWeight = FontWeight.SemiBold); Text("${item.country} · ${words(item.payoutMethod.name)}") }
                }
            }
            item { OutlinedTextField(origin, { origin = it.take(2) }, label = { Text("Origin country") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(amount, { amount = it }, label = { Text("Send amount") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(currency, { currency = it.take(3) }, label = { Text("Send currency") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(note, { note = it }, label = { Text("Note (optional)") }, modifier = Modifier.fillMaxWidth(), minLines = 2) }
            item {
                Button(
                    onClick = { if (recipient != null && minor != null) viewModel.createTransfer(recipient, origin, minor, currency, note) },
                    enabled = !state.busy && recipient != null && origin.length == 2 && currency.length == 3 && minor != null,
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Submit request") }
            }
        }
    }
}

@Composable
private fun TransferDetailScreen(state: HawellyUiState, viewModel: HawellyViewModel) {
    val bundle = state.selected
    if (bundle == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item { TransferSummary(bundle) }
        item { QuoteSection(bundle, state.busy, viewModel) }
        item { FundingSection(bundle, state.busy, viewModel) }
        item { PayoutSection(bundle) }
        item { ResolutionSection(bundle, state.busy, viewModel) }
        item { TimelineSection(bundle) }
    }
}

@Composable
private fun TransferSummary(bundle: TransferBundle) {
    val transfer = bundle.transfer
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(transfer.recipientName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                StatusText(transfer.status)
            }
            Text("${transfer.originCountry} → ${transfer.destinationCountry}")
            Text("${money(transfer.sendAmountMinor)} ${transfer.sendCurrency}", style = MaterialTheme.typography.headlineSmall)
            Text(words(transfer.requestedPayoutMethod.name), color = MaterialTheme.colorScheme.onSurfaceVariant)
            transfer.senderNote?.let { Text(it) }
        }
    }
}

@Composable
private fun QuoteSection(bundle: TransferBundle, busy: Boolean, viewModel: HawellyViewModel) {
    val quote = bundle.quotes.firstOrNull()
    SectionCard("Quote") {
        if (quote == null) {
            Text("A Hawelly staff member is preparing your quote.")
        } else {
            Text("Recipient gets", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${money(quote.receiveAmountMinor)} ${quote.receiveCurrency}", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text("Fee ${money(quote.feeAmountMinor)} ${quote.sendCurrency} · Rate ${quote.effectiveRate}")
            Text("Expected ${friendlyDate(quote.expectedDeliveryAt)}")
            Text("Expires ${friendlyDate(quote.expiresAt)}")
            quote.senderFacingNote?.let { Text(it) }
            if (quote.status == "SENT") {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(enabled = !busy, onClick = { viewModel.decideQuote("ACCEPT", null) }) { Text("Accept") }
                    OutlinedButton(enabled = !busy, onClick = { viewModel.decideQuote("REJECT", "Quote does not meet my needs") }) { Text("Decline") }
                }
            } else StatusText(quote.status)
        }
    }
}

@Composable
private fun FundingSection(bundle: TransferBundle, busy: Boolean, viewModel: HawellyViewModel) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var reference by remember(bundle.transfer.id) { mutableStateOf("") }
    var note by remember(bundle.transfer.id) { mutableStateOf("") }
    var attachment by remember(bundle.transfer.id) { mutableStateOf<AttachmentUpload?>(null) }
    var fileError by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch {
            runCatching { withContext(Dispatchers.IO) { readAttachment(context, uri) } }
                .onSuccess { attachment = it; fileError = null }
                .onFailure { fileError = it.message ?: "Could not read that file" }
        }
    }
    SectionCard("Funding") {
        val instruction = bundle.funding.instruction
        if (instruction == null) {
            Text("Funding instructions appear after you accept a quote.")
        } else {
            Text("${money(instruction.amountMinor)} ${instruction.currency}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("Payee: ${instruction.payeeName}")
            instruction.provider?.let { Text("Provider: $it") }
            instruction.accountReference?.let { Text("Account/reference: $it") }
            Text("Your reference: ${instruction.senderReference}")
            Text(instruction.instructions, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (bundle.funding.proofs.isNotEmpty()) {
            HorizontalDivider()
            bundle.funding.proofs.forEach { proof ->
                Text("${proof.reference ?: proof.originalFilename ?: "Funding proof"} · ${words(proof.status)}")
                proof.reviewReason?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        }
        if (bundle.transfer.status == "FUNDING_PENDING") {
            HorizontalDivider()
            Text("Submit proof", fontWeight = FontWeight.SemiBold)
            OutlinedTextField(reference, { reference = it }, label = { Text("Transfer reference") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(note, { note = it }, label = { Text("Note (optional)") }, modifier = Modifier.fillMaxWidth())
            OutlinedButton(onClick = { picker.launch("*/*") }, modifier = Modifier.fillMaxWidth()) {
                Text(attachment?.filename ?: "Attach receipt (JPEG, PNG, or PDF)")
            }
            fileError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                enabled = !busy && (reference.isNotBlank() || attachment != null),
                onClick = { viewModel.submitFundingProof(reference, note, attachment) },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Submit funding proof") }
        }
    }
}

@Composable
private fun PayoutSection(bundle: TransferBundle) {
    SectionCard("Payout") {
        val payout = bundle.payout
        if (payout == null) Text("Payout coordination starts after funds are confirmed.") else {
            StatusText(payout.status)
            Text("${money(payout.amountMinor)} ${payout.currency} · ${words(payout.payoutMethod.name)}")
            Text("Expected ${friendlyDate(payout.expectedBy)}")
            payout.senderFacingNote?.let { Text(it) }
            payout.completedAt?.let { Text("Completed ${friendlyDate(it)}") }
        }
    }
}

@Composable
private fun ResolutionSection(bundle: TransferBundle, busy: Boolean, viewModel: HawellyViewModel) {
    var confirmNote by remember(bundle.transfer.id) { mutableStateOf("") }
    var disputeReason by remember(bundle.transfer.id) { mutableStateOf("") }
    SectionCard("Confirmation & support") {
        bundle.resolution.confirmations.forEach { Text("${words(it.source)} confirmation · ${friendlyDate(it.confirmedAt)}") }
        bundle.resolution.refund?.let { refund ->
            Text("Refund ${words(refund.status)}", fontWeight = FontWeight.Bold)
            Text("${money(refund.amountMinor)} ${refund.currency} · ${refund.senderFacingReason}")
        }
        bundle.resolution.disputes.forEach { Text("${it.category} · ${words(it.status)}") }
        if (bundle.transfer.status == "CONFIRMATION_PENDING") {
            OutlinedTextField(confirmNote, { confirmNote = it }, label = { Text("Confirmation note (optional)") }, modifier = Modifier.fillMaxWidth())
            Button(enabled = !busy, onClick = { viewModel.confirmRecipientReceived(confirmNote) }, modifier = Modifier.fillMaxWidth()) {
                Text("My recipient received the money")
            }
        }
        if (bundle.transfer.status in setOf("PAYOUT_IN_PROGRESS", "PAYOUT_REPORTED", "CONFIRMATION_PENDING")) {
            HorizontalDivider()
            Text("Something went wrong?", fontWeight = FontWeight.SemiBold)
            OutlinedTextField(disputeReason, { disputeReason = it }, label = { Text("Describe the issue") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
            OutlinedButton(
                enabled = !busy && disputeReason.isNotBlank(),
                onClick = { viewModel.openDispute("PAYOUT_ISSUE", disputeReason) },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Open a dispute") }
        }
    }
}

@Composable
private fun TimelineSection(bundle: TransferBundle) {
    SectionCard("Timeline") {
        if (bundle.transfer.timeline.isEmpty()) Text("Your transfer timeline will appear here.")
        bundle.transfer.timeline.forEach { event ->
            Row {
                Text("•", color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(9.dp))
                Column {
                    Text(words(event.type), fontWeight = FontWeight.SemiBold)
                    Text(friendlyDate(event.occurredAt), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    event.reason?.let { Text(it) }
                }
            }
        }
    }
}

@Composable
private fun ProfileScreen(state: HawellyUiState, viewModel: HawellyViewModel) {
    val context = LocalContext.current
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Text(state.user?.fullName.orEmpty(), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(state.user?.email.orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Sender account · ${words(state.user?.status.orEmpty())}")
        }
        item {
            SectionCard("App updates") {
                val update = state.update
                when {
                    update == null -> Text("Checking for updates…")
                    update.updateAvailable -> {
                        Text("Version ${update.latestVersionName} is available", fontWeight = FontWeight.Bold)
                        if (update.updateRequired) Text("This update is required to continue safely.", color = MaterialTheme.colorScheme.error)
                        update.releaseNotes?.let { Text(it) }
                        update.sha256?.let { Text("SHA-256 ${it.take(12)}…", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        if (update.downloadUrl != null) Button(onClick = {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(update.downloadUrl)))
                        }) { Text("Open secure download") }
                    }
                    else -> Text("Hawelly is up to date (version ${update.latestVersionName}).")
                }
                OutlinedButton(onClick = viewModel::checkUpdate) { Text("Check again") }
            }
        }
        item {
            SectionCard("Session security") {
                Text("Your rotating refresh token is encrypted with Android Keystore and never written to logs.")
                OutlinedButton(onClick = { viewModel.logout(false) }, modifier = Modifier.fillMaxWidth()) { Text("Sign out on this device") }
                TextButton(onClick = { viewModel.logout(true) }, modifier = Modifier.fillMaxWidth()) { Text("Sign out on all devices", color = MaterialTheme.colorScheme.error) }
            }
        }
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

@Composable
private fun EmptyCard(title: String, detail: String) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, fontWeight = FontWeight.Bold)
            Text(detail, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun StatusText(status: String) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.extraSmall
    ) {
        Text(
            words(status),
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.labelMedium
        )
    }
}

private fun words(value: String) = value.lowercase().replace('_', ' ').replaceFirstChar { it.titlecase() }
private fun friendlyDate(value: String) = value.replace('T', ' ').replace("Z", "").take(16)
private fun money(minor: String): String = runCatching {
    BigDecimal(minor).movePointLeft(2).setScale(2, RoundingMode.UNNECESSARY).toPlainString()
}.getOrDefault(minor)

private fun firstPayoutDetail(recipient: Recipient) = when (recipient.payoutMethod) {
    PayoutMethod.BANK_TRANSFER -> recipient.payoutDetails["accountName"]
    PayoutMethod.CASH_PICKUP -> recipient.payoutDetails["city"]
    PayoutMethod.MOBILE_MONEY -> recipient.payoutDetails["provider"]
    PayoutMethod.OTHER -> recipient.payoutDetails["instructions"]
}

private fun secondPayoutDetail(recipient: Recipient) = when (recipient.payoutMethod) {
    PayoutMethod.BANK_TRANSFER -> recipient.payoutDetails["bankName"]
    PayoutMethod.MOBILE_MONEY -> recipient.payoutDetails["accountNumber"]
    else -> null
}

internal fun amountToMinor(value: String): String? = runCatching {
    val amount = BigDecimal(value.trim()).setScale(2, RoundingMode.UNNECESSARY)
    if (amount.signum() <= 0) null else amount.movePointRight(2).toBigIntegerExact().toString()
}.getOrNull()

private fun readAttachment(context: Context, uri: Uri): AttachmentUpload {
    var name = "receipt"
    var reportedSize: Long? = null
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            name = cursor.getString(0) ?: name
            if (!cursor.isNull(1)) reportedSize = cursor.getLong(1)
        }
    }
    require(reportedSize == null || reportedSize in 1..MAX_ATTACHMENT_BYTES) { "Receipt must be 8 MB or smaller" }
    val contentType = context.contentResolver.getType(uri) ?: "application/octet-stream"
    require(contentType in setOf("image/jpeg", "image/png", "application/pdf")) { "Choose a JPEG, PNG, or PDF receipt" }
    val bytes = context.contentResolver.openInputStream(uri)?.use { input ->
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(16 * 1024)
        var total = 0L
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            require(total <= MAX_ATTACHMENT_BYTES) { "Receipt must be 8 MB or smaller" }
            output.write(buffer, 0, read)
        }
        output.toByteArray()
    } ?: error("Could not open that file")
    require(bytes.isNotEmpty() && bytes.size <= MAX_ATTACHMENT_BYTES) { "Receipt must be 8 MB or smaller" }
    return AttachmentUpload(name.take(255), contentType, bytes)
}

private const val MAX_ATTACHMENT_BYTES = 8L * 1024 * 1024
