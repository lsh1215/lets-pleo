package dev.pleos.letspleo

import kotlin.math.abs

/** Counts only whole seconds backed by a recent AAOS speed sample and a known non-P gear. */
class TripState(private val parkGear: Int) {
    var movingSeconds: Int = 0
        private set
    private var speed = 0f
    private var lastSpeedAt = 0L
    private var gear: Int? = null
    private var parkedSince = 0L

    fun onSpeed(value: Float, elapsedMillis: Long) {
        if (value.isFinite()) {
            speed = value
            lastSpeedAt = elapsedMillis
        } else {
            lastSpeedAt = 0L
        }
    }

    fun onGear(value: Int) { gear = value }

    fun onSpeedUnavailable() {
        lastSpeedAt = 0L
        parkedSince = 0L
    }

    fun onSignalDisconnected() {
        gear = null
        lastSpeedAt = 0L
        parkedSince = 0L
    }

    fun speedFresh(elapsedMillis: Long): Boolean =
        lastSpeedAt > 0 && elapsedMillis - lastSpeedAt in 0..5_000

    /** Returns true only after a real moving segment followed by 30 seconds parked. */
    fun tick(elapsedMillis: Long): Boolean {
        val speedIsFresh = speedFresh(elapsedMillis)
        if (gear != null && gear != parkGear && speedIsFresh && abs(speed) >= 1f) movingSeconds++
        if (movingSeconds > 0 && gear == parkGear && speedIsFresh && abs(speed) < 1f) {
            if (parkedSince == 0L) parkedSince = elapsedMillis
            if (elapsedMillis - parkedSince >= 30_000) return true
        } else parkedSince = 0L
        return false
    }
}
