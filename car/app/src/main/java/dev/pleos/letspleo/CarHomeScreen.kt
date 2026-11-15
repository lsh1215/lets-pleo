package dev.pleos.letspleo

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Cream = Color(0xFFFFF8E9)
private val Ink = Color(0xFF3D5141)
private val Sage = Color(0xFF78A887)
private val Apricot = Color(0xFFED9C70)
private val Muted = Color(0xFF60725D)
private val MaterialNames = listOf("wood" to "나무", "stone" to "돌", "fabric" to "천", "seed" to "씨앗")

@Composable
fun CarHomeScreen(
    message: String, parked: Boolean, paired: Boolean, pairing: Boolean, active: Boolean,
    movingSeconds: Int, arrival: JourneyReceipt.Snapshot?, locationGranted: Boolean, pairCode: String,
    onKey: (String) -> Unit, onPair: () -> Unit, onStart: () -> Unit, onStop: () -> Unit,
    onPermission: () -> Unit, onRetry: () -> Unit,
    collectedMaterials: Map<String, Int> = emptyMap(), collectionConnected: Boolean = true,
) {
    MaterialTheme(colorScheme = lightColorScheme(primary = Ink, onPrimary = Cream, secondary = Sage,
        background = Cream, surface = Cream, onSurface = Ink)) {
        Surface(Modifier.fillMaxSize(), color = Cream) {
            BoxWithConstraints(Modifier.fillMaxSize().padding(40.dp)) {
                val compact = maxWidth < 900.dp
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(28.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("렛츠 플레오  ✿", fontSize = 28.sp, fontWeight = FontWeight.Bold)
                        Text(if (active) "●  자동 수집 중" else if (paired) "내 마을과 연결됨" else "첫 여행 준비", fontSize = 22.sp,
                            modifier = Modifier.background(Color(0xFFE3EDDA), RoundedCornerShape(50)).padding(horizontal = 24.dp, vertical = 12.dp))
                    }
                    if (active) {
                        // Server-confirmed quantities update at movement checkpoints; no taps or popping loot.
                        CollectionScene(movingSeconds, compact, collectedMaterials, collectionConnected)
                        if (parked) JourneyButton("탐험 마무리하기", true, onStop)
                    } else if (!parked) {
                        Text("주차 후 여행을 준비해요", fontSize = 36.sp, fontWeight = FontWeight.Bold)
                        Text("P에 두고 완전히 멈추면 탐험을 시작할 수 있어요.", fontSize = 28.sp, lineHeight = 40.sp)
                        Text(message, fontSize = 22.sp, color = Muted)
                    } else if (!paired) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(32.dp)) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                                Text("내 마을을\n여행에 데려와요", fontSize = 36.sp, lineHeight = 48.sp, fontWeight = FontWeight.Bold)
                                Text("모바일 여행 탭의\n8자리 코드를 입력해 주세요.", fontSize = 28.sp, lineHeight = 40.sp)
                                Text(message, fontSize = 22.sp, color = Muted)
                                TextButton(onClick = onRetry, enabled = !pairing) { Text("새 코드로 연결하기", fontSize = 24.sp) }
                            }
                            Column(Modifier.width(if (compact) 280.dp else 380.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text(pairCode.padEnd(8, '·').chunked(4).joinToString("  "), fontSize = 36.sp,
                                    modifier = Modifier.align(Alignment.CenterHorizontally).padding(bottom = 16.dp), fontWeight = FontWeight.Bold)
                                for (keys in listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("", "0", "지움"))) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        for (key in keys) {
                                            if (key.isEmpty()) Spacer(Modifier.weight(1f))
                                            else FilledTonalButton(onClick = { onKey(key) }, enabled = !pairing,
                                                modifier = Modifier.weight(1f).height(72.dp), shape = RoundedCornerShape(24.dp),
                                                colors = ButtonDefaults.filledTonalButtonColors(containerColor = Color(0xFFE3EDDA), contentColor = Ink)) {
                                                Text(key, fontSize = if (key == "지움") 24.sp else 30.sp)
                                            }
                                        }
                                    }
                                }
                                JourneyButton(if (pairing) "연결 중" else "마을 연결하기", !pairing && pairCode.length == 8, onPair, Modifier.fillMaxWidth())
                            }
                        }
                    } else if (arrival != null) {
                        ArrivalScene(arrival, compact)
                        StartAction(locationGranted, onPermission, onStart)
                    } else {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(32.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                                Text("오늘의 길을\n마을의 재료로", fontSize = 40.sp, lineHeight = 52.sp, fontWeight = FontWeight.Bold)
                                Text("차에서는 재료를 모으고,\n도착하면 마을을 꾸며요.", fontSize = 28.sp, lineHeight = 40.sp)
                                StartAction(locationGranted, onPermission, onStart)
                            }
                            if (!compact) VillagePostcard(Modifier.weight(0.85f).height(350.dp))
                        }
                        MaterialShelf(null)
                        Text("탐험을 시작하면 평소 이동을 자동으로 기록해요.", fontSize = 24.sp, color = Muted)
                    }
                }
            }
        }
    }
}

@Composable
private fun CollectionScene(movingSeconds: Int, compact: Boolean, collectedMaterials: Map<String, Int>, connected: Boolean) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(32.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Text("마을 재료를 모으고 있어요", fontSize = 36.sp, lineHeight = 48.sp, fontWeight = FontWeight.Bold)
            Text("이동할 때마다 재료가 가방에 쌓여요.\n도착하면 이 재료로 마을을 꾸며요.", fontSize = 28.sp, lineHeight = 40.sp)
            Text(if (movingSeconds < 60) "여행 가방 · 자동 적립" else "이동 ${movingSeconds / 60}분 · 여행 가방에 기록 중", fontSize = 24.sp, color = Muted)
        }
        if (!compact) TravelBag(Modifier.width(380.dp).height(290.dp))
    }
    MaterialShelf(collectedMaterials)
    Text(if (connected) "여행 가방에 담긴 재료 · 도착 후 모바일로" else "연결 대기 · 마지막으로 확인된 재료", fontSize = 28.sp, fontWeight = FontWeight.Medium)
    Text("자동으로 모으고 있어요. 조작 없이 운전에 집중하세요.", fontSize = 24.sp, color = Muted)
}

@Composable
private fun ArrivalScene(receipt: JourneyReceipt.Snapshot, compact: Boolean) {
    val hasMaterials = receipt.materials?.values?.any { it > 0 } == true
    val hasScenery = receipt.scenery != null
    Text(when {
        !receipt.synced -> "여행 가방을 전달하고 있어요"
        hasMaterials || hasScenery -> "이번 여행에서 모았어요"
        receipt.materials == null -> "여행 기록이 마을에 도착했어요"
        else -> "이번 여행도 잘 담았어요"
    }, fontSize = 36.sp, lineHeight = 48.sp, fontWeight = FontWeight.Bold)
    Text("이동 ${receipt.movingSeconds / 60}분 ${receipt.movingSeconds % 60}초 · " + if (receipt.synced) "마을에 전달 완료" else "연결되면 자동 전달", fontSize = 24.sp, color = Muted)
    if (receipt.materials != null) {
        MaterialShelf(receipt.materials)
        if (hasScenery) {
            val theme = mapOf("city" to "도시", "forest" to "숲", "sea" to "바다")[receipt.scenery]
            Text("✦  $theme 풍경 조각 +1", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        }
        Text(if (hasMaterials) "모바일에서 여행 가방을 열고 가구를 만들어 보세요." else "이번에 추가된 재료는 없어요. 재료 보상은 하루 누적 이동에 따라 정해져요.", fontSize = 28.sp, lineHeight = 40.sp)
    } else {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (!compact) TravelBag(Modifier.width(300.dp).height(230.dp))
            Text(if (receipt.synced) "이전 여행의 재료는 모바일 여행 탭에서 확인해 주세요." else "서버가 재료를 확인하고 있어요.\n확정되면 이곳에 수량이 나타나요.", modifier = Modifier.weight(1f), fontSize = 28.sp, lineHeight = 40.sp)
        }
    }
}

@Composable
private fun StartAction(locationGranted: Boolean, onPermission: () -> Unit, onStart: () -> Unit) {
    if (!locationGranted) Text("위치 권한을 허용하면 탐험을 시작할 수 있어요.", fontSize = 24.sp, lineHeight = 36.sp)
    JourneyButton(if (locationGranted) "탐험 시작하기" else "위치 권한 허용", true, if (locationGranted) onStart else onPermission)
}

@Composable
private fun MaterialShelf(amounts: Map<String, Int>?) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val columns = if (maxWidth < 650.dp) 2 else 4
        Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
            MaterialNames.chunked(columns).forEach { group ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                    group.forEach { (id, label) ->
                        Column(Modifier.weight(1f).background(Color(0xFFF4EDD9), RoundedCornerShape(32.dp)).padding(vertical = 24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            MaterialIcon(id, Modifier.size(100.dp))
                            Text(label, fontSize = 28.sp, fontWeight = FontWeight.Medium)
                            if (amounts != null) Text("+${amounts[id] ?: 0}", fontSize = 40.sp, fontWeight = FontWeight.Bold, color = Ink)
                        }
                    }
                }
            }
        }
    }
}

/** Original material pictograms are shared by collecting and confirmed arrival states. */
@Composable
private fun MaterialIcon(id: String, modifier: Modifier) {
    Canvas(modifier) {
        val u = size.minDimension / 100f
        fun p(x: Float, y: Float) = Offset(x * u, y * u)
        fun rect(c: Color, x: Float, y: Float, w: Float, h: Float, r: Float) = drawRoundRect(c, p(x,y), Size(w*u,h*u), CornerRadius(r*u))
        when (id) {
            "wood" -> {
                rect(Color(0xFFB98557), 14f, 37f, 74f, 35f, 12f)
                rect(Color(0xFFD6AC7A), 8f, 18f, 73f, 32f, 12f)
                drawCircle(Color(0xFFF1D6A8), 16f*u,p(23f,34f)); drawCircle(Color(0xFFB98557), 9f*u,p(23f,34f),style=Stroke(3f*u))
                drawLine(Color(0xFF956B47),p(48f,30f),p(72f,30f),3f*u)
                drawCircle(Color(0xFFE5C28D), 17f*u,p(30f,64f)); drawCircle(Color(0xFF956B47), 10f*u,p(30f,64f),style=Stroke(3f*u))
            }
            "stone" -> {
                drawPath(Path().apply { moveTo(12f*u,68f*u); lineTo(22f*u,30f*u); lineTo(54f*u,15f*u); lineTo(81f*u,33f*u); lineTo(92f*u,70f*u); lineTo(57f*u,88f*u); close() },Color(0xFF8CABA8))
                drawPath(Path().apply { moveTo(22f*u,30f*u); lineTo(54f*u,15f*u); lineTo(67f*u,48f*u); lineTo(35f*u,61f*u); close() },Color(0xFFBED2C8))
                drawLine(Color(0xFF71938E),p(35f,61f),p(57f,88f),3f*u)
            }
            "fabric" -> {
                rect(Color(0xFFC78078), 17f, 30f, 72f, 56f, 10f)
                rect(Color(0xFFF0BBB0), 10f, 14f, 73f, 61f, 12f)
                drawLine(Color(0xFFD89889),p(27f,18f),p(27f,69f),3f*u)
                drawLine(Cream,p(13f,57f),p(78f,57f),4f*u)
                drawLine(Cream,p(13f,65f),p(78f,65f),2f*u)
            }
            else -> {
                rect(Color(0xFFE1C58C), 19f, 32f, 64f, 58f, 15f)
                rect(Color(0xFFF2DCAC), 14f, 27f, 64f, 57f, 15f)
                drawOval(Sage,p(27f,9f),Size(26f*u,18f*u));drawOval(Color(0xFFA4C48B),p(48f,3f),Size(26f*u,22f*u))
                drawLine(Ink,p(49f,16f),p(49f,34f),3f*u)
                drawOval(Color(0xFFAA8156),p(39f,49f),Size(15f*u,21f*u))
            }
        }
    }
}

@Composable
private fun TravelBag(modifier: Modifier) {
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val u = minOf(size.width/380f,size.height/290f)
            fun p(x:Float,y:Float)=Offset(x*u,y*u)
            drawOval(Color(0xFFE3EDDA),p(18f,12f),Size(344f*u,262f*u))
            drawRoundRect(Color(0xFF9C7958),p(141f,86f),Size(98f*u,61f*u),CornerRadius(22f*u),style=Stroke(13f*u))
            drawRoundRect(Apricot,p(70f,118f),Size(240f*u,143f*u),CornerRadius(32f*u))
            drawRoundRect(Color(0xFFF3BA88),p(70f,118f),Size(240f*u,49f*u),CornerRadius(25f*u))
            for (x in listOf(115f,247f)) drawRoundRect(Color(0xFFA77F56),p(x,122f),Size(16f*u,139f*u),CornerRadius(7f*u))
            drawRoundRect(Cream,p(165f,182f),Size(52f*u,42f*u),CornerRadius(12f*u))
            drawCircle(Sage,9f*u,p(191f,203f))
        }
        Row(Modifier.align(Alignment.TopCenter).padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MaterialIcon("wood",Modifier.size(70.dp));MaterialIcon("seed",Modifier.size(70.dp));MaterialIcon("fabric",Modifier.size(70.dp))
        }
    }
}

@Composable
private fun JourneyButton(label: String, enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Button(onClick = onClick, enabled = enabled, modifier = modifier.heightIn(min = 76.dp),
        contentPadding = PaddingValues(horizontal = 32.dp, vertical = 20.dp), shape = RoundedCornerShape(28.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Apricot, contentColor = Ink)) {
        Text(label, fontSize = 28.sp, fontWeight = FontWeight.Bold)
    }
}
/** Original static illustration, drawn locally. No external game character or asset. */
@Composable
private fun VillagePostcard(modifier: Modifier) {
    Canvas(modifier) {
        val unit = minOf(size.width / 480f, size.height / 430f)
        val x0 = (size.width - 480f * unit) / 2f
        fun at(x: Float, y: Float) = Offset(x0 + x * unit, y * unit)
        fun oval(color: Color, x: Float, y: Float, w: Float, h: Float) = drawOval(color, at(x, y), Size(w * unit, h * unit))
        fun round(color: Color, x: Float, y: Float, w: Float, h: Float, radius: Float) = drawRoundRect(color, at(x, y), Size(w * unit, h * unit), CornerRadius(radius * unit))
        oval(Color(0xFFE3EDDA), 10f, 20f, 460f, 380f)
        oval(Color(0xFFC8DBA8), 5f, 220f, 470f, 165f)
        oval(Color(0xFFF3CF78), 330f, 55f, 54f, 54f)
        for ((x, y, pink) in listOf(Triple(82f, 195f, false), Triple(384f, 205f, true), Triple(330f, 275f, false))) {
            round(Color(0xFFAC896A), x - 6f, y, 12f, 58f, 5f)
            oval(if (pink) Color(0xFFE5B2AC) else Sage, x - 40f, y - 60f, 70f, 80f)
            oval(if (pink) Color(0xFFF2CEBD) else Color(0xFF9CBD84), x - 6f, y - 44f, 46f, 58f)
        }
        round(Color(0xFFF5DEB6), 170f, 178f, 128f, 112f, 12f)
        drawPath(Path().apply { moveTo(at(150f, 182f).x, at(150f, 182f).y); lineTo(at(234f, 114f).x, at(234f, 114f).y); lineTo(at(318f, 182f).x, at(318f, 182f).y); close() }, Apricot)
        round(Color(0xFFA87E59), 218f, 226f, 34f, 64f, 16f)
        round(Cream, 184f, 208f, 22f, 26f, 6f)
        round(Cream, 264f, 208f, 22f, 26f, 6f)
        for (i in 0..4) oval(Cream, 220f - i * 22f, 298f + i * 14f, 32f, 12f)
        for ((x, y) in listOf(94f to 310f, 365f to 320f, 130f to 245f, 305f to 350f)) {
            for (angle in 0..3) {
                val dx = if (angle % 2 == 0) (angle - 1) * 6f else 0f
                val dy = if (angle % 2 == 1) (angle - 2) * 6f else 0f
                drawCircle(Cream, 5f * unit, at(x + dx, y + dy))
            }
            drawCircle(Apricot, 3f * unit, at(x, y))
        }
    }
}
