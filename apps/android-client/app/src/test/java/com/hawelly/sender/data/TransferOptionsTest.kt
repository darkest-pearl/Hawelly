package com.hawelly.sender.data

import org.junit.Assert.assertEquals
import org.junit.Test

class TransferOptionsTest {
    @Test
    fun derivesEveryRecipientDestinationFromCorridors() {
        val options = SenderTransferOptions(
            quoteSlaMinutes = 30,
            corridors = listOf(
                TransferCorridorOption("AE", "PH", listOf("AED"), listOf(PayoutMethod.BANK_TRANSFER)),
                TransferCorridorOption("GB", "PH", listOf("GBP"), listOf(PayoutMethod.MOBILE_MONEY)),
                TransferCorridorOption("AE", "IN", listOf("AED"), listOf(PayoutMethod.BANK_TRANSFER))
            )
        )

        assertEquals(30, options.quoteSlaMinutes)
        assertEquals(
            listOf(
                RecipientDestinationOption(
                    "PH",
                    listOf(PayoutMethod.BANK_TRANSFER, PayoutMethod.MOBILE_MONEY)
                ),
                RecipientDestinationOption("IN", listOf(PayoutMethod.BANK_TRANSFER))
            ),
            options.recipientDestinations()
        )
    }
}
