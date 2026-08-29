package com.hawelly.sender.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ApiClientTest {
    @Test
    fun acceptsHttpsAndEmulatorLocalOrigins() {
        assertEquals("https://api.example.com", ApiClient.validatedOrigin("https://api.example.com"))
        assertEquals("http://10.0.2.2:4000", ApiClient.validatedOrigin("http://10.0.2.2:4000"))
    }

    @Test
    fun rejectsUntrustedCleartextAndCredentialedOrigins() {
        assertThrows(IllegalArgumentException::class.java) {
            ApiClient.validatedOrigin("http://api.example.com")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ApiClient.validatedOrigin("https://user:pass@api.example.com")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ApiClient.validatedOrigin("https://api.example.com/path")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ApiClient.validatedOrigin("https://")
        }
    }
}
