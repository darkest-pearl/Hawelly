package com.hawelly.sender.ui

import com.hawelly.sender.data.PayoutMethod

private val controlCharacter = Regex("\\p{Cc}")
private val repeatedWhitespace = Regex("\\s+")
private val internationalPhone = Regex("^\\+[1-9]\\d{7,14}$")

data class NameValidation(val normalized: String, val error: String?)

fun validatePersonName(value: String): NameValidation {
    if (controlCharacter.containsMatchIn(value)) {
        return NameValidation(value, "Name cannot contain control characters.")
    }
    val normalized = value.trim().replace(repeatedWhitespace, " ")
    val length = normalized.codePointCount(0, normalized.length)
    val error = when {
        normalized.isEmpty() -> "Enter a name."
        length > 160 -> "Name must be 160 characters or fewer."
        else -> null
    }
    return NameValidation(normalized, error)
}

data class ValidatedRecipientInput(
    val fullName: String,
    val phone: String?,
    val address: String?,
    val payoutDetails: Map<String, String>
)

data class RecipientValidationResult(
    val value: ValidatedRecipientInput?,
    val errors: Map<String, String>
)

fun validateRecipientInput(
    fullName: String,
    phone: String,
    address: String,
    method: PayoutMethod,
    detailOne: String,
    detailTwo: String,
    detailThree: String
): RecipientValidationResult {
    val errors = linkedMapOf<String, String>()
    val name = validatePersonName(fullName)
    if (name.error != null) errors["fullName"] = name.error

    val normalizedPhone = phone.trim().ifEmpty { null }
    if (normalizedPhone != null && !internationalPhone.matches(normalizedPhone)) {
        errors["phone"] = "Use international format, for example +971501234567."
    }
    val normalizedAddress = address.trim().ifEmpty { null }
    if (normalizedAddress != null && normalizedAddress.codePointCount(0, normalizedAddress.length) > 500) {
        errors["address"] = "Address must be 500 characters or fewer."
    }

    fun required(key: String, value: String, label: String, maximum: Int): String {
        val normalized = value.trim()
        when {
            normalized.isEmpty() -> errors[key] = "Enter $label."
            normalized.codePointCount(0, normalized.length) > maximum ->
                errors[key] = "$label must be $maximum characters or fewer."
        }
        return normalized
    }

    val payoutDetails = when (method) {
        PayoutMethod.BANK_TRANSFER -> mapOf(
            "accountName" to required("accountName", detailOne, "the account holder name", 160),
            "bankName" to required("bankName", detailTwo, "the bank name", 160),
            "accountNumber" to required("accountNumber", detailThree, "the account number", 100)
        )
        PayoutMethod.MOBILE_MONEY -> mapOf(
            "provider" to required("provider", detailOne, "the mobile-money provider", 160),
            "accountNumber" to required("accountNumber", detailTwo, "the account number", 100)
        )
        PayoutMethod.CASH_PICKUP -> mapOf(
            "city" to required("city", detailOne, "the pickup city", 160)
        )
        PayoutMethod.OTHER -> mapOf(
            "instructions" to required("instructions", detailOne, "the payout instructions", 500)
        )
    }

    return RecipientValidationResult(
        value = if (errors.isEmpty()) {
            ValidatedRecipientInput(name.normalized, normalizedPhone, normalizedAddress, payoutDetails)
        } else null,
        errors = errors
    )
}

fun validatePasswordChange(
    currentPassword: String,
    newPassword: String,
    confirmation: String
): Map<String, String> = buildMap {
    if (currentPassword.isEmpty()) put("currentPassword", "Enter your current password.")
    if (newPassword.length !in 12..128) {
        put("newPassword", "Use a new password of 12–128 characters.")
    }
    if (confirmation != newPassword) {
        put("confirmation", "Passwords do not match.")
    }
}
