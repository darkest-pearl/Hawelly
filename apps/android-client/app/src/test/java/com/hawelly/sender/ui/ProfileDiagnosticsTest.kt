package com.hawelly.sender.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertEquals
import org.junit.Test

class ProfileDiagnosticsTest {
    @Test
    fun diagnosticsContainOnlyTheApprovedTechnicalFields() {
        val value = diagnosticInformation(
            versionName = "1.0.2-beta",
            versionCode = 3,
            applicationId = "com.hawelly.sender",
            androidVersion = "15",
            deviceModel = "Pixel 9",
            apiHostname = "hawellybeta.duckdns.org"
        )

        listOf(
            "1.0.2-beta", "Version code: 3", "com.hawelly.sender",
            "Android version: 15", "Pixel 9", "hawellybeta.duckdns.org"
        ).forEach { assertTrue(value.contains(it)) }
        listOf("token", "password", "@example.com", "recipient", "account number")
            .forEach { assertFalse(value.lowercase().contains(it)) }
    }

    @Test
    fun supportUsesTheExactConfiguredSameOriginRoute() {
        assertEquals(
            "https://hawellybeta.duckdns.org/support",
            supportUrl("https://hawellybeta.duckdns.org")
        )
        assertEquals(
            "http://10.0.2.2:3000/support",
            supportUrl("http://10.0.2.2:3000")
        )
    }
}
