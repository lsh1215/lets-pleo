package dev.pleos.letspleo

import org.junit.Assert.*
import org.junit.Test

class TravelThemeTest {
    @Test fun `missing location does not interrupt speed backed base movement`() {
        val location = TravelThemeState()
        val movement = TripState(4)
        movement.onGear(8)
        for (time in 1_000L..10_000L step 1_000) {
            location.unavailable()
            movement.onSpeed(3f, time)
            movement.tick(time)
        }
        assertNull(location.current(10_000))
        assertEquals(10, movement.movingSeconds)
    }
    @Test fun `all six regions include southwest and exclude northeast boundaries`() {
        assertEquals(mapOf("city" to 2, "forest" to 2, "sea" to 2), TravelThemeCatalog.regions.groupingBy { it.theme }.eachCount())
        for (r in TravelThemeCatalog.regions) {
            assertEquals(r.theme, TravelThemeCatalog.classify((r.south+r.north)/2, (r.west+r.east)/2))
            assertEquals(r.theme, TravelThemeCatalog.classify(r.south, r.west))
            assertNull(TravelThemeCatalog.classify(r.north, r.east))
            assertNull(TravelThemeCatalog.classify(r.south - 0.000001, r.west))
            assertNull(TravelThemeCatalog.classify(r.south, r.west - 0.000001))
        }
        assertNull(TravelThemeCatalog.classify(0.0, 0.0))
        assertNull(TravelThemeCatalog.classify(Double.NaN, 127.0))
        assertNull(TravelThemeCatalog.classify(37.5, Double.POSITIVE_INFINITY))
        assertNull(TravelThemeCatalog.classify(91.0, 181.0))
    }

    @Test fun `latest location wins and outside region removes old theme`() {
        val state = TravelThemeState()
        state.update(37.565, 126.977, 100_000, 100_000, 10_000)
        assertEquals("city", state.current(10_000))
        state.update(35.160, 129.160, 101_000, 101_000, 11_000)
        assertEquals("sea", state.current(11_000))
        state.update(37.565, 126.977, 100_000, 101_000, 11_000)
        assertEquals("sea", state.current(11_000))
        state.update(0.0, 0.0, 102_000, 102_000, 12_000)
        assertNull(state.current(12_000))
    }

    @Test fun `missing stale invalid future and repeated samples cannot retain a reward theme`() {
        val state = TravelThemeState()
        assertNull(state.current(1_000))
        state.update(37.545, 127.040, 100_000, 100_000, 10_000)
        assertEquals("forest", state.current(70_000))
        assertNull(state.current(70_001))
        state.update(37.545, 127.040, 100_000, 150_000, 60_000)
        assertNull(state.current(70_001))
        state.update(37.545, 127.040, 200_000, 200_000, 110_000)
        state.unavailable()
        assertNull(state.current(110_000))
        state.update(37.545, 127.040, 300_000, 360_001, 270_001)
        assertNull(state.current(270_001))
        state.update(37.545, 127.040, 400_001, 400_000, 310_000)
        assertNull(state.current(310_000))
        state.update(Double.NaN, 127.040, 400_000, 400_000, 310_000)
        assertNull(state.current(310_000))
    }
}
