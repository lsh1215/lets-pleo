package dev.pleos.letspleo

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Demo-build visual fixture only. No collection, network calls or inventory writes. */
class MaterialPreviewActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val state = intent.getStringExtra("state") ?: "arrival"
        val receipt = when (state) {
            "arrival" -> JourneyReceipt.Snapshot(319, true, mapOf("wood" to 8, "stone" to 6, "fabric" to 4, "seed" to 2), "forest")
            "zero" -> JourneyReceipt.Snapshot(40, true, mapOf("wood" to 0, "stone" to 0, "fabric" to 0, "seed" to 0))
            "pending" -> JourneyReceipt.Snapshot(319, false)
            else -> null
        }
        setContent {
            Column {
                Text("UI 미리보기 · 예시 데이터 · $state", Modifier.fillMaxWidth().background(Color(0xFFE3EDDA)).padding(12.dp), fontSize = 20.sp, color = Color(0xFF3D5141))
                CarHomeScreen("", state != "collecting", true, false, state == "collecting", 180, receipt,
                    true, "", {}, {}, {}, {}, {}, {})
            }
        }
    }
}
