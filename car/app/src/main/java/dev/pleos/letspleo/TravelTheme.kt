package dev.pleos.letspleo

/** Game-defined WGS84 rectangles; sources and boundary policy are in docs/travel-themes.md. */
object TravelThemeCatalog {
    const val VERSION = 1
    data class Region(val id: String, val theme: String, val south: Double, val north: Double,
                      val west: Double, val east: Double) {
        fun contains(latitude: Double, longitude: Double) =
            latitude >= south && latitude < north && longitude >= west && longitude < east
    }
    val regions = listOf(
        Region("seoul-plaza", "city", 37.560, 37.570, 126.970, 126.983),
        Region("gangnam", "city", 37.492, 37.504, 127.020, 127.036),
        Region("seoul-forest", "forest", 37.539, 37.552, 127.033, 127.050),
        Region("dream-forest", "forest", 37.613, 37.629, 127.033, 127.050),
        Region("haeundae", "sea", 35.153, 35.166, 129.150, 129.174),
        Region("gwangalli", "sea", 35.145, 35.160, 129.110, 129.128),
    )

    fun classify(latitude: Double, longitude: Double): String? {
        if (!latitude.isFinite() || !longitude.isFinite() || latitude !in -90.0..90.0 || longitude !in -180.0..180.0) return null
        return regions.firstOrNull { it.contains(latitude, longitude) }?.theme
    }
}

/** Keeps no route or coordinates. Missing/invalid callbacks invalidate the current theme. */
class TravelThemeState {
    private var theme: String? = null
    private var receivedAt = -1L
    private var sourceTimestamp = -1L

    fun update(latitude: Double, longitude: Double, timestampMillis: Long, wallMillis: Long, elapsedMillis: Long) {
        val age = wallMillis - timestampMillis
        if (!latitude.isFinite() || !longitude.isFinite() || latitude !in -90.0..90.0 || longitude !in -180.0..180.0 ||
            timestampMillis <= 0 || age !in 0..60_000 || elapsedMillis < 0) {
            unavailable()
            return
        }
        // A delayed callback must not replace a more recent location.
        if (timestampMillis <= sourceTimestamp) return
        sourceTimestamp = timestampMillis
        theme = TravelThemeCatalog.classify(latitude, longitude)
        receivedAt = elapsedMillis - age
    }

    fun unavailable() { theme = null; receivedAt = -1L }

    fun current(elapsedMillis: Long): String? =
        if (receivedAt >= 0 && elapsedMillis - receivedAt in 0..60_000) theme else null
}
