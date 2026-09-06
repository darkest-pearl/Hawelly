package com.hawelly.sender.data

import org.junit.Assert.assertEquals
import org.junit.Test

class TransferOptionsTest {
    private fun options(vararg corridors: TransferCorridorOption) = SenderTransferOptions(
        configurationVersion = 4,
        quoteSlaMinutes = 30,
        corridors = corridors.toList()
    )

    @Test
    fun derivesMultipleCountriesAndMergesAuthoritativeOptions() {
        val options = options(
            TransferCorridorOption("AE", "EG", listOf("AED"), listOf("EGP"), listOf(PayoutMethod.BANK_TRANSFER)),
            TransferCorridorOption("GB", "EG", listOf("GBP"), listOf("EGP"), listOf(PayoutMethod.MOBILE_MONEY)),
            TransferCorridorOption("AE", "UG", listOf("AED"), listOf("UGX"), listOf(PayoutMethod.BANK_TRANSFER))
        )

        assertEquals(30, options.quoteSlaMinutes)
        assertEquals(
            listOf(
                RecipientDestinationOption(
                    "EG",
                    listOf("EGP"),
                    listOf(PayoutMethod.BANK_TRANSFER, PayoutMethod.MOBILE_MONEY)
                ),
                RecipientDestinationOption("UG", listOf("UGX"), listOf(PayoutMethod.BANK_TRANSFER))
            ),
            options.recipientDestinations()
        )
    }

    @Test
    fun preservesOneConfiguredCountryWithoutInventingAnother() {
        val destinations = options(
            TransferCorridorOption("AE", "ET", listOf("AED"), listOf("ETB"), listOf(PayoutMethod.CASH_PICKUP))
        ).recipientDestinations()
        assertEquals(listOf("ET"), destinations.map { it.country })
        assertEquals(listOf("ETB"), destinations.single().receiveCurrencies)
    }

    @Test
    fun returnsNoCountriesWhenRuntimeConfigurationHasNoCorridors() {
        assertEquals(emptyList<RecipientDestinationOption>(), options().recipientDestinations())
    }

    @Test
    fun changingCountryUpdatesPayoutSelection() {
        val destinations = options(
            TransferCorridorOption("AE", "EG", listOf("AED"), listOf("EGP"), listOf(PayoutMethod.BANK_TRANSFER)),
            TransferCorridorOption("AE", "UG", listOf("AED"), listOf("UGX"), listOf(PayoutMethod.MOBILE_MONEY))
        ).recipientDestinations()
        assertEquals(
            RecipientDestinationSelection("UG", PayoutMethod.MOBILE_MONEY),
            reconcileDestinationSelection(destinations, "UG", PayoutMethod.BANK_TRANSFER)
        )
    }

    @Test
    fun rendersFullEnglishCountryNameWithIsoCode() {
        assertEquals("Egypt (EG)", countryOptionLabel("EG"))
        assertEquals("Uganda (UG)", countryOptionLabel("UG"))
        assertEquals("Ethiopia (ET)", countryOptionLabel("ET"))
    }

    @Test
    fun configurationRefreshPreservesValidSelectionAndClearsRemovedCountry() {
        val first = options(
            TransferCorridorOption("AE", "EG", listOf("AED"), listOf("EGP"), listOf(PayoutMethod.BANK_TRANSFER))
        ).recipientDestinations()
        val refreshed = options(
            TransferCorridorOption("AE", "EG", listOf("AED"), listOf("EGP"), listOf(PayoutMethod.MOBILE_MONEY))
        ).recipientDestinations()
        assertEquals(
            RecipientDestinationSelection("EG", PayoutMethod.BANK_TRANSFER),
            reconcileDestinationSelection(first, "EG", PayoutMethod.BANK_TRANSFER)
        )
        assertEquals(
            RecipientDestinationSelection("EG", PayoutMethod.MOBILE_MONEY),
            reconcileDestinationSelection(refreshed, "EG", PayoutMethod.BANK_TRANSFER)
        )
        assertEquals(
            RecipientDestinationSelection("", null),
            reconcileDestinationSelection(emptyList(), "EG", PayoutMethod.BANK_TRANSFER)
        )
    }
}
