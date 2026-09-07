package com.hawelly.sender.ui

import com.hawelly.sender.data.PayoutMethod
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FormValidationTest {
    @Test
    fun acceptsInclusiveNamesAndNormalizesRepeatedSpaces() {
        val names = listOf(
            "Musab Mohammed Ibrahim",
            "Amina M. Hassan",
            "Jean-Claude O’Neill",
            "Abdul Rahman Mohammed Ali",
            "Madonna",
            "مصعب محمد إبراهيم",
            "ሙሳብ መሐመድ ኢብራሂም"
        )
        names.forEach { assertNull(validatePersonName(it).error) }
        assertEquals(
            "Musab Mohammed Ibrahim",
            validatePersonName("  Musab   Mohammed   Ibrahim  ").normalized
        )
        assertTrue(validatePersonName("Musab\tIbrahim").error != null)
    }

    @Test
    fun requiresEveryMethodSpecificPayoutField() {
        val bank = validateRecipientInput(
            "Valid Name", "", "", PayoutMethod.BANK_TRANSFER,
            "Account Name", "", ""
        )
        assertEquals(setOf("bankName", "accountNumber"), bank.errors.keys)

        val mobile = validateRecipientInput(
            "Valid Name", "", "", PayoutMethod.MOBILE_MONEY,
            "", "", ""
        )
        assertEquals(setOf("provider", "accountNumber"), mobile.errors.keys)
        assertTrue(validateRecipientInput(
            "Valid Name", "", "", PayoutMethod.CASH_PICKUP,
            "", "", ""
        ).errors.containsKey("city"))
        assertTrue(validateRecipientInput(
            "Valid Name", "", "", PayoutMethod.OTHER,
            "", "", ""
        ).errors.containsKey("instructions"))
    }

    @Test
    fun acceptsBlankPhoneAndExplainsInvalidSuppliedPhone() {
        val blank = validateRecipientInput(
            "Valid Name", "   ", "", PayoutMethod.CASH_PICKUP,
            "Al Ain", "", ""
        )
        assertTrue(blank.errors.isEmpty())
        assertNull(blank.value?.phone)

        val invalid = validateRecipientInput(
            "Valid Name", "050 123 4567", "", PayoutMethod.CASH_PICKUP,
            "Al Ain", "", ""
        )
        assertEquals(
            "Use international format, for example +971501234567.",
            invalid.errors["phone"]
        )
    }

    @Test
    fun catchesPasswordConfirmationAndCurrentPasswordLocally() {
        assertEquals(
            mapOf(
                "currentPassword" to "Enter your current password.",
                "confirmation" to "Passwords do not match."
            ),
            validatePasswordChange("", "A-New-Secure-Password", "different")
        )
    }
}
