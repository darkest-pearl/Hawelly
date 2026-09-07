package com.hawelly.sender.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class JsonParsersTest {
    @Test
    fun unwrapsTransferDetailEnvelope() {
        val response = JSONObject(
            """
            {
              "transfer": {
                "id": "00000000-0000-4000-8000-000000000001",
                "reference": "HW-20260907-000000000001",
                "recipientId": "00000000-0000-4000-8000-000000000002",
                "recipient": { "fullName": "Musab Mohammed Ibrahim" },
                "originCountry": "AE",
                "destinationCountry": "EG",
                "sendAmountMinor": "10000",
                "sendCurrency": "AED",
                "requestedPayoutMethod": "BANK_TRANSFER",
                "status": "REQUESTED",
                "quoteDueAt": "2026-09-07T10:30:00.000Z",
                "senderNote": null,
                "createdAt": "2026-09-07T10:00:00.000Z",
                "timeline": []
              }
            }
            """.trimIndent()
        )

        assertEquals(
            "00000000-0000-4000-8000-000000000001",
            parseTransferResponse(response).id
        )
    }
}
