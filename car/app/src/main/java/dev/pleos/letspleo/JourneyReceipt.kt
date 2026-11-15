package dev.pleos.letspleo

import android.content.Context
import org.json.JSONObject

/** Last arrival plus the immutable server receipt, not a prediction based on elapsed time. */
object JourneyReceipt {
    data class Snapshot(
        val movingSeconds: Int,
        val synced: Boolean,
        val materials: Map<String, Int>? = null,
        val scenery: String? = null,
    )
    private fun preferences(context: Context) = context.getSharedPreferences("journey_receipt", Context.MODE_PRIVATE)
    fun record(context: Context, id: String, movingSeconds: Int) {
        check(preferences(context).edit().putString("id", id).putInt("seconds", movingSeconds)
            .putBoolean("synced", false).remove("reward").commit()) { "Arrival receipt persistence failed" }
    }
    fun delivered(context: Context, id: String, receipt: JSONObject) {
        val prefs = preferences(context)
        if (prefs.getString("id", null) == id) {
            check(prefs.edit().putBoolean("synced", true).putString("reward", receipt.toString()).commit()) {
                "Arrival reward persistence failed"
            }
        }
    }
    fun read(context: Context): Snapshot? {
        val prefs = preferences(context)
        if (!prefs.contains("id")) return null
        val reward = runCatching { JSONObject(prefs.getString("reward", "") ?: "") }.getOrNull()
        val amounts = if (reward?.optBoolean("confirmed") == true) {
            val values = reward.optJSONObject("materials")
            listOf("wood", "stone", "fabric", "seed").associateWith { values?.optInt(it, 0) ?: 0 }
        } else null
        val scenery = reward?.optString("scenery")?.takeIf { it in listOf("city", "forest", "sea") }
        return Snapshot(prefs.getInt("seconds", 0), prefs.getBoolean("synced", false), amounts, scenery)
    }
}
