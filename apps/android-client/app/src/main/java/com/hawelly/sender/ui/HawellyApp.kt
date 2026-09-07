package com.hawelly.sender.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
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
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
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
import androidx.compose.runtime.saveable.rememberSaveable
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
import com.hawelly.sender.BuildConfig
import com.hawelly.sender.data.AttachmentUpload
import com.hawelly.sender.data.PayoutMethod
import com.hawelly.sender.data.Recipient
import com.hawelly.sender.data.SenderTransferOptions
import com.hawelly.sender.data.Transfer
import com.hawelly.sender.data.TransferBundle
import com.hawelly.sender.data.countryOptionLabel
import com.hawelly.sender.data.reconcileDestinationSelection
import com.hawelly.sender.data.recipientDestinations
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
            state.user == null -> AuthScreen(
                state.busy,
                state.message,
                state.error,
                viewModel::login,
                viewModel::register
            )
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
    message: String?,
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
            message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
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
        AppScreen.TRANSFER_CONFIRMATION -> "Request submitted"
        AppScreen.TRANSFER_DETAIL -> state.selected?.transfer?.reference ?: "Transfer"
        AppScreen.PROFILE -> "Profile & security"
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title, fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    if (
                        state.screen == AppScreen.TRANSFER_DETAIL ||
                        state.screen == AppScreen.NEW_TRANSFER ||
                        state.screen == AppScreen.TRANSFER_CONFIRMATION
                    ) {
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
                AppScreen.TRANSFER_CONFIRMATION -> TransferConfirmationScreen(state, viewModel)
                AppScreen.TRANSFER_DETAIL -> TransferDetailScreen(state, viewModel)
                AppScreen.PROFILE -> ProfileScreenV3(state, viewModel)
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
    var editingId by rememberSaveable { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf<Recipient?>(null) }
    var editorOpen by rememberSaveable { mutableStateOf(false) }
    var observedSaveSequence by rememberSaveable {
        mutableStateOf(state.recipientSaveSequence)
    }
    val editing = state.recipients.firstOrNull { it.id == editingId }
    LaunchedEffect(state.recipientSaveSequence) {
        if (state.recipientSaveSequence > observedSaveSequence) {
            observedSaveSequence = state.recipientSaveSequence
            editorOpen = false
        }
    }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("Your recipients", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("Recipient payout details stay linked to your account.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(14.dp))
            Button(
                enabled = !state.busy && state.transferOptions?.corridors?.isNotEmpty() == true,
                onClick = { editingId = null; editorOpen = true },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Add recipient") }
            when {
                state.transferOptions == null && state.busy -> Text("Loading recipient countries…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                state.transferOptions == null && state.error != null -> Text("Recipient countries are unavailable. Try again.", color = MaterialTheme.colorScheme.error)
                state.transferOptions?.corridors?.isEmpty() == true -> Text("No recipient countries are currently configured.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
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
                                OutlinedButton(onClick = { editingId = recipient.id; editorOpen = true }) { Text("Edit") }
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
            options = state.transferOptions,
            busy = state.busy,
            serverErrors = state.fieldErrors,
            close = { editorOpen = false },
            save = { id, name, country, phone, method, details, address ->
                viewModel.saveRecipient(id, name, country, phone, method, details, address)
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RecipientEditor(
    existing: Recipient?,
    options: SenderTransferOptions?,
    busy: Boolean,
    serverErrors: Map<String, String>,
    close: () -> Unit,
    save: (String?, String, String, String?, PayoutMethod, Map<String, String>, String?) -> Unit
) {
    val destinations = remember(options) { options?.recipientDestinations().orEmpty() }
    var name by rememberSaveable(existing?.id) { mutableStateOf(existing?.fullName.orEmpty()) }
    var country by rememberSaveable(existing?.id) { mutableStateOf(existing?.country.orEmpty()) }
    var countryExpanded by remember { mutableStateOf(false) }
    var phone by rememberSaveable(existing?.id) { mutableStateOf(existing?.phone.orEmpty()) }
    var address by rememberSaveable(existing?.id) { mutableStateOf(existing?.address.orEmpty()) }
    var method by rememberSaveable(existing?.id) { mutableStateOf(existing?.payoutMethod ?: PayoutMethod.BANK_TRANSFER) }
    var detailOne by rememberSaveable(existing?.id) { mutableStateOf(existing?.let(::firstPayoutDetail).orEmpty()) }
    var detailTwo by rememberSaveable(existing?.id) { mutableStateOf(existing?.let(::secondPayoutDetail).orEmpty()) }
    var detailThree by rememberSaveable(existing?.id) { mutableStateOf(existing?.payoutDetails?.get("accountNumber").orEmpty()) }
    var localErrors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    val destination = destinations.firstOrNull { it.country == country }
    val supportedMethods = destination?.payoutMethods.orEmpty()
    val methodOptions = supportedMethods.ifEmpty {
        existing?.payoutMethod?.let(::listOf).orEmpty()
    }
    val routeAvailable = destination != null && method in supportedMethods
    LaunchedEffect(options?.configurationVersion, existing?.id) {
        val refreshed = destinations.firstOrNull { it.country == country }
        if (refreshed != null) {
            val selection = reconcileDestinationSelection(destinations, country, method)
            country = selection.country
            selection.payoutMethod?.let { method = it }
        } else if (existing == null) {
            country = ""
        }
    }
    val detailFields = when (method) {
        PayoutMethod.BANK_TRANSFER -> listOf(
            "accountName" to "Account name",
            "bankName" to "Bank name",
            "accountNumber" to "Account number"
        )
        PayoutMethod.CASH_PICKUP -> listOf("city" to "Pickup city")
        PayoutMethod.MOBILE_MONEY -> listOf(
            "provider" to "Provider",
            "accountNumber" to "Account number"
        )
        PayoutMethod.OTHER -> listOf("instructions" to "Instructions")
    }
    fun errorFor(field: String) = localErrors[field] ?: serverErrors[field]
    AlertDialog(
        onDismissRequest = close,
        title = { Text(if (existing == null) "Add recipient" else "Edit recipient") },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    val error = errorFor("fullName")
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it; localErrors = localErrors - "fullName" },
                        label = { Text("Full name") },
                        supportingText = error?.let { { Text(it) } },
                        isError = error != null,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    ExposedDropdownMenuBox(
                        expanded = countryExpanded,
                        onExpandedChange = { if (destinations.isNotEmpty() && !busy) countryExpanded = !countryExpanded }
                    ) {
                        OutlinedTextField(
                            value = country.takeIf(String::isNotBlank)?.let(::countryOptionLabel).orEmpty(),
                            onValueChange = {},
                            readOnly = true,
                            enabled = destinations.isNotEmpty() && !busy,
                            label = { Text("Country") },
                            placeholder = { Text(if (destinations.isEmpty()) "No countries configured" else "Select country") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = countryExpanded) },
                            modifier = Modifier
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = destinations.isNotEmpty() && !busy)
                                .fillMaxWidth()
                        )
                        ExposedDropdownMenu(
                            expanded = countryExpanded,
                            onDismissRequest = { countryExpanded = false }
                        ) {
                            destinations.forEach { option ->
                                DropdownMenuItem(
                                    text = { Text(countryOptionLabel(option.country)) },
                                    onClick = {
                                        val selection = reconcileDestinationSelection(destinations, option.country, method)
                                        country = selection.country
                                        selection.payoutMethod?.let { method = it }
                                        countryExpanded = false
                                    }
                                )
                            }
                        }
                    }
                    if (!routeAvailable && existing != null) {
                        Text(
                            "This saved recipient route is no longer available. Choose an enabled country and payout method.",
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                    destination?.let {
                        Text(
                            "Receiving currency: ${it.receiveCurrencies.joinToString()}",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                item {
                    val error = errorFor("phone")
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it; localErrors = localErrors - "phone" },
                        label = { Text("Phone (optional)") },
                        placeholder = { Text("International format, e.g. +971501234567") },
                        supportingText = {
                            Text(error ?: "Include + and the country code when provided.")
                        },
                        isError = error != null,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    Text("Payout method", fontWeight = FontWeight.SemiBold)
                    methodOptions.forEach { option ->
                        Row(Modifier.fillMaxWidth().clickable {
                            method = option
                            localErrors = emptyMap()
                        }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(method == option, {
                                method = option
                                localErrors = emptyMap()
                            })
                            Text(words(option.name))
                        }
                    }
                }
                detailFields.forEachIndexed { index, (key, label) ->
                    item {
                        val current = when (index) {
                            0 -> detailOne
                            1 -> detailTwo
                            else -> detailThree
                        }
                        val error = errorFor(key)
                        OutlinedTextField(
                            value = current,
                            onValueChange = {
                                when (index) {
                                    0 -> detailOne = it
                                    1 -> detailTwo = it
                                    else -> detailThree = it
                                }
                                localErrors = localErrors - key
                            },
                            label = { Text(label) },
                            supportingText = error?.let { { Text(it) } },
                            isError = error != null,
                            singleLine = method != PayoutMethod.OTHER,
                            minLines = if (method == PayoutMethod.OTHER) 2 else 1,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
                item {
                    val error = errorFor("address")
                    OutlinedTextField(
                        value = address,
                        onValueChange = { address = it; localErrors = localErrors - "address" },
                        label = { Text("Address (optional)") },
                        supportingText = error?.let { { Text(it) } },
                        isError = error != null,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !busy && routeAvailable,
                onClick = {
                    val result = validateRecipientInput(
                        name,
                        phone,
                        address,
                        method,
                        detailOne,
                        detailTwo,
                        detailThree
                    )
                    localErrors = result.errors
                    result.value?.let { value ->
                        save(
                            existing?.id,
                            value.fullName,
                            country,
                            value.phone,
                            method,
                            value.payoutDetails,
                            value.address
                        )
                    }
                }
            ) { Text(if (busy) "Saving…" else "Save") }
        },
        dismissButton = { TextButton(onClick = close) { Text("Cancel") } }
    )
}

@Composable
private fun NewTransferScreen(state: HawellyUiState, viewModel: HawellyViewModel) {
    var selectedId by rememberSaveable { mutableStateOf(state.recipients.firstOrNull()?.id) }
    var origin by rememberSaveable { mutableStateOf("") }
    var amount by rememberSaveable { mutableStateOf("") }
    var currency by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    val recipient = state.recipients.firstOrNull { it.id == selectedId }
    val corridors = state.transferOptions?.corridors.orEmpty().filter { corridor ->
        recipient != null && corridor.destinationCountry == recipient.country &&
            recipient.payoutMethod in corridor.payoutMethods
    }
    val origins = corridors.map { it.originCountry }.distinct()
    val currencies = corridors.filter { it.originCountry == origin }
        .flatMap { it.sendCurrencies }
        .distinct()
    val receiveCurrencies = corridors.flatMap { it.receiveCurrencies }.distinct()
    LaunchedEffect(state.recipients) {
        if (state.recipients.none { it.id == selectedId }) {
            selectedId = state.recipients.firstOrNull()?.id
        }
    }
    LaunchedEffect(recipient?.id, state.transferOptions) {
        val firstRoute = corridors.firstOrNull()
        origin = firstRoute?.originCountry.orEmpty()
        currency = firstRoute?.sendCurrencies?.firstOrNull().orEmpty()
    }
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
            if (corridors.isEmpty()) {
                item { Text("No enabled transfer route is available for this recipient.", color = MaterialTheme.colorScheme.error) }
            } else {
                item { Text("Origin country", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
                items(origins) { country ->
                    Row(Modifier.fillMaxWidth().clickable {
                        origin = country
                        currency = corridors.first { it.originCountry == country }.sendCurrencies.first()
                    }.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(origin == country, {
                            origin = country
                            currency = corridors.first { it.originCountry == country }.sendCurrencies.first()
                        })
                        Text(countryOptionLabel(country))
                    }
                }
            }
            item { OutlinedTextField(amount, { amount = it }, label = { Text("Send amount") }, modifier = Modifier.fillMaxWidth()) }
            item { Text("Send currency", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
            items(currencies) { item ->
                Row(Modifier.fillMaxWidth().clickable { currency = item }.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(currency == item, { currency = item })
                    Text(item)
                }
            }
            if (receiveCurrencies.isNotEmpty()) {
                item {
                    Text(
                        "Recipient receives in ${receiveCurrencies.joinToString()}",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            item { OutlinedTextField(note, { note = it }, label = { Text("Note (optional)") }, modifier = Modifier.fillMaxWidth(), minLines = 2) }
            item {
                Button(
                    onClick = { if (recipient != null && minor != null) viewModel.createTransfer(recipient, origin, minor, currency, note) },
                    enabled = !state.busy && recipient != null && origin in origins && currency in currencies && minor != null,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (state.busy) {
                        CircularProgressIndicator(
                            modifier = Modifier.width(18.dp).height(18.dp),
                            strokeWidth = 2.dp
                        )
                        Spacer(Modifier.width(8.dp))
                        Text("Submitting…")
                    } else {
                        Text("Submit request")
                    }
                }
            }
        }
    }
}

@Composable
private fun TransferConfirmationScreen(state: HawellyUiState, viewModel: HawellyViewModel) {
    val transfer = state.confirmedTransfer
    if (transfer == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("The confirmed transfer request is unavailable.")
        }
        return
    }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                "Transfer request submitted",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                "Hawelly staff will review your request and prepare a quote.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        item {
            SectionCard("Request confirmation") {
                Text("Reference", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    transfer.reference,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
                Text("Current status", color = MaterialTheme.colorScheme.onSurfaceVariant)
                StatusText(transfer.status)
            }
        }
        state.hydrationWarning?.let { warning ->
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(
                        Modifier.padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text(warning, color = MaterialTheme.colorScheme.error)
                        OutlinedButton(
                            enabled = !state.busy,
                            onClick = viewModel::retryConfirmedTransferHydration
                        ) { Text("Refresh request") }
                    }
                }
            }
        }
        item {
            Button(
                enabled = !state.busy,
                onClick = viewModel::viewConfirmedTransfer,
                modifier = Modifier.fillMaxWidth()
            ) { Text("View request") }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = viewModel::finishTransferConfirmation,
                modifier = Modifier.fillMaxWidth()
            ) { Text("Done") }
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
private fun ProfileScreenV3(state: HawellyUiState, viewModel: HawellyViewModel) {
    val context = LocalContext.current
    var editNameOpen by rememberSaveable { mutableStateOf(false) }
    var passwordOpen by rememberSaveable { mutableStateOf(false) }
    var observedNameSaveSequence by rememberSaveable {
        mutableStateOf(state.profileNameSaveSequence)
    }
    LaunchedEffect(state.profileNameSaveSequence) {
        if (state.profileNameSaveSequence > observedNameSaveSequence) {
            observedNameSaveSequence = state.profileNameSaveSequence
            editNameOpen = false
        }
    }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Text("Profile & security", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(
                "Manage the account details and security controls available in this beta.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        item {
            SectionCard("Personal information") {
                Text("Full name", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(state.user?.fullName.orEmpty(), fontWeight = FontWeight.SemiBold)
                Text("Email", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(state.user?.email.orEmpty())
                Text("Account type", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(words(state.user?.role.orEmpty()))
                Text("Account status", color = MaterialTheme.colorScheme.onSurfaceVariant)
                StatusText(state.user?.status.orEmpty())
                OutlinedButton(
                    enabled = !state.busy,
                    onClick = { editNameOpen = true },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Edit full name") }
                Text(
                    "Email, phone, and other identity-sensitive changes are handled through the verified support process during beta.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        item {
            SectionCard("Password security") {
                Text("Changing your password signs you out on every device.")
                Button(
                    enabled = !state.busy,
                    onClick = { passwordOpen = true },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Change password") }
            }
        }
        item {
            SectionCard("App updates") {
                val update = state.update
                when {
                    update == null -> Text("Checking for updates…")
                    update.updateAvailable -> {
                        Text("Version ${update.latestVersionName} is available", fontWeight = FontWeight.Bold)
                        if (update.updateRequired) {
                            Text("This update is required to continue safely.", color = MaterialTheme.colorScheme.error)
                        }
                        update.releaseNotes?.let { Text(it) }
                        update.sha256?.let {
                            Text("SHA-256 ${it.take(12)}…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (update.downloadUrl != null) {
                            Button(onClick = {
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(update.downloadUrl)))
                            }) { Text("Open secure download") }
                        }
                    }
                    else -> Text("Hawelly is up to date (version ${update.latestVersionName}).")
                }
                OutlinedButton(onClick = viewModel::checkUpdate) { Text("Check again") }
            }
        }
        item {
            SectionCard("App information") {
                Text("Version ${BuildConfig.VERSION_NAME}")
                Text("Build ${BuildConfig.VERSION_CODE}")
                Text(BuildConfig.APPLICATION_ID, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(
                    onClick = {
                        val diagnostics = diagnosticInformation(
                            versionName = BuildConfig.VERSION_NAME,
                            versionCode = BuildConfig.VERSION_CODE,
                            applicationId = BuildConfig.APPLICATION_ID,
                            androidVersion = Build.VERSION.RELEASE,
                            deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
                            apiHostname = Uri.parse(BuildConfig.API_BASE_URL).host.orEmpty()
                        )
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE)
                            as ClipboardManager
                        clipboard.setPrimaryClip(
                            ClipData.newPlainText("Hawelly diagnostic information", diagnostics)
                        )
                        viewModel.notify("Diagnostic information copied")
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Copy diagnostic information") }
            }
        }
        item {
            SectionCard("Help & safety") {
                Text("Hawelly staff never need your password.")
                Text(
                    "Send identity or funding evidence only through the protected transfer flow when Hawelly requests it."
                )
                OutlinedButton(
                    onClick = {
                        context.startActivity(
                            Intent(Intent.ACTION_VIEW, Uri.parse(supportUrl(BuildConfig.WEB_BASE_URL)))
                        )
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Help & support") }
            }
        }
        item {
            SectionCard("Session security") {
                Text("Your rotating refresh token is encrypted with Android Keystore and never written to logs.")
                OutlinedButton(
                    onClick = { viewModel.logout(false) },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Sign out on this device") }
                TextButton(
                    onClick = { viewModel.logout(true) },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Sign out on all devices", color = MaterialTheme.colorScheme.error) }
            }
        }
    }
    if (editNameOpen) {
        EditFullNameDialog(
            currentName = state.user?.fullName.orEmpty(),
            busy = state.busy,
            serverError = state.fieldErrors["fullName"],
            dismiss = { if (!state.busy) editNameOpen = false },
            save = viewModel::updateFullName
        )
    }
    if (passwordOpen) {
        ChangePasswordDialog(
            busy = state.busy,
            serverErrors = state.fieldErrors,
            dismiss = { if (!state.busy) passwordOpen = false },
            save = viewModel::changePassword
        )
    }
}

@Composable
private fun EditFullNameDialog(
    currentName: String,
    busy: Boolean,
    serverError: String?,
    dismiss: () -> Unit,
    save: (String) -> Unit
) {
    var name by rememberSaveable(currentName) { mutableStateOf(currentName) }
    var localError by remember { mutableStateOf<String?>(null) }
    val error = localError ?: serverError
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text("Edit full name") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Use the complete name you want Hawelly staff to see.")
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it; localError = null },
                    label = { Text("Full name") },
                    supportingText = error?.let { message -> { Text(message) } },
                    isError = error != null,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                enabled = !busy,
                onClick = {
                    val validation = validatePersonName(name)
                    localError = validation.error
                    if (validation.error == null) save(validation.normalized)
                }
            ) { Text(if (busy) "Saving…" else "Save") }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = dismiss) { Text("Cancel") } }
    )
}

@Composable
private fun ChangePasswordDialog(
    busy: Boolean,
    serverErrors: Map<String, String>,
    dismiss: () -> Unit,
    save: (String, String) -> Unit
) {
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var localErrors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    fun errorFor(field: String) = localErrors[field] ?: serverErrors[field]
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text("Change password") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Use 12–128 characters. You will sign in again after the change.")
                OutlinedTextField(
                    value = currentPassword,
                    onValueChange = {
                        currentPassword = it
                        localErrors = localErrors - "currentPassword"
                    },
                    label = { Text("Current password") },
                    supportingText = errorFor("currentPassword")?.let { message -> { Text(message) } },
                    isError = errorFor("currentPassword") != null,
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = newPassword,
                    onValueChange = {
                        newPassword = it
                        localErrors = localErrors - "newPassword" - "confirmation"
                    },
                    label = { Text("New password") },
                    supportingText = errorFor("newPassword")?.let { message -> { Text(message) } },
                    isError = errorFor("newPassword") != null,
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = confirmation,
                    onValueChange = {
                        confirmation = it
                        localErrors = localErrors - "confirmation"
                    },
                    label = { Text("Confirm new password") },
                    supportingText = errorFor("confirmation")?.let { message -> { Text(message) } },
                    isError = errorFor("confirmation") != null,
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                enabled = !busy,
                onClick = {
                    localErrors = validatePasswordChange(
                        currentPassword,
                        newPassword,
                        confirmation
                    )
                    if (localErrors.isEmpty()) save(currentPassword, newPassword)
                }
            ) { Text(if (busy) "Changing…" else "Change password") }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = dismiss) { Text("Cancel") } }
    )
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
