package com.hawelly.sender.data

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionRevocationTest {
    @Test
    fun preservesLocalSessionWhenAllDeviceRevocationFails() = runBlocking {
        var cleared = false

        val failure = runCatching {
            clearAfterConfirmedRevocation(
                revoke = { error("revocation unavailable") },
                clear = { cleared = true }
            )
        }.exceptionOrNull()

        assertEquals("revocation unavailable", failure?.message)
        assertFalse(cleared)
    }

    @Test
    fun clearsLocalSessionAfterAllDeviceRevocationSucceeds() = runBlocking {
        var revoked = false
        var cleared = false

        clearAfterConfirmedRevocation(
            revoke = { revoked = true },
            clear = { cleared = true }
        )

        assertTrue(revoked)
        assertTrue(cleared)
    }
}
