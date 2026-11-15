package dev.pleos.letspleo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TripStateTest {
    @Test fun `parking before moving never finishes a trip`() {
        val state = TripState(4)
        state.onGear(4)
        state.onSpeed(0f, 1_000)
        for (time in 2_000L..35_000L step 1_000) {
            state.onSpeed(0f, time)
            assertFalse(state.tick(time))
        }
        assertEquals(0, state.movingSeconds)
    }

    @Test fun `stale speed and disconnected car never add moving time`() {
        val state = TripState(4)
        state.onGear(8)
        state.onSpeed(3f, 1_000)
        for (time in 2_000L..6_000L step 1_000) assertFalse(state.tick(time))
        assertEquals(5, state.movingSeconds)
        for (time in 7_000L..15_000L step 1_000) assertFalse(state.tick(time))
        assertEquals(5, state.movingSeconds)
        state.onSignalDisconnected()
        assertFalse(state.speedFresh(16_000))
        state.onSpeed(5f, 16_000)
        assertTrue(state.speedFresh(17_000))
        state.tick(17_000)
        assertEquals(5, state.movingSeconds)
        state.onGear(8)
        state.tick(18_000)
        assertEquals(6, state.movingSeconds)
    }

    @Test fun `traffic stop does not finish but parked thirty seconds does`() {
        val state = TripState(4)
        state.onGear(8)
        state.onSpeed(4f, 1_000)
        state.tick(2_000)
        state.onSpeed(0f, 3_000)
        for (time in 4_000L..38_000L step 1_000) {
            state.onSpeed(0f, time)
            assertFalse(state.tick(time))
        }
        state.onGear(4)
        for (time in 39_000L..68_000L step 1_000) {
            state.onSpeed(0f, time)
            assertFalse(state.tick(time))
        }
        state.onSpeed(0f, 69_000)
        assertTrue(state.tick(69_000))
        assertEquals(1, state.movingSeconds)
    }
    @Test fun `explicit speed failure pauses immediately and a fresh sample resumes`() {
        val state = TripState(4)
        state.onGear(8)
        state.onSpeed(3f, 1_000)
        state.tick(2_000)
        state.onSpeedUnavailable()
        for (time in 3_000L..10_000L step 1_000) assertFalse(state.tick(time))
        assertEquals(1, state.movingSeconds)
        state.onSpeed(3f, 11_000)
        state.tick(11_000)
        assertEquals(2, state.movingSeconds)
    }

    @Test fun `invalid speed never counts movement or completes parking`() {
        val state = TripState(4)
        state.onGear(8)
        state.onSpeed(3f, 1_000)
        state.tick(2_000)
        for (value in listOf(Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY)) {
            state.onSpeed(value, 3_000)
            assertFalse(state.tick(4_000))
        }
        assertEquals(1, state.movingSeconds)
        state.onGear(4)
        for (time in 5_000L..45_000L step 1_000) assertFalse(state.tick(time))
    }

}
