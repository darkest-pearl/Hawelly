package com.hawelly.sender.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AmountTest {
    @Test
    fun convertsPositiveDecimalAmountsToMinorUnits() {
        assertEquals("12345", amountToMinor("123.45"))
        assertEquals("100", amountToMinor("1"))
    }

    @Test
    fun rejectsNonPositiveOrOverPreciseAmounts() {
        assertNull(amountToMinor("0"))
        assertNull(amountToMinor("1.001"))
        assertNull(amountToMinor("not-money"))
    }
}
