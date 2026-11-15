package dev.pleos.letspleo

import android.Manifest
import android.app.Activity
import android.car.Car
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    private var message by mutableStateOf("차량 상태 확인 중")
    private var allowed by mutableStateOf(false)
    private var car: Car? = null
    private var ux: CarUxRestrictionsManager? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Column(Modifier.padding(24.dp)) {
                    Text("렛츠 플레오 · 차량 연동 검증")
                    Text(message)
                    Button(onClick = { startProbe() }, enabled = allowed) { Text("탐험 검증 시작") }
                    Button(onClick = { stopService(Intent(this@MainActivity, TripProbeService::class.java)) }) {
                        Text("검증 종료")
                    }
                }
            }
        }
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), 1)
        }
    }

    override fun onStart() {
        super.onStart()
        car = Car.createCar(this, null, Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { connected, ready ->
            runOnUiThread {
                if (!ready) {
                    allowed = false
                    message = "차량 서비스 연결 안 됨"
                } else {
                    try {
                        ux = connected.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as CarUxRestrictionsManager
                        ux?.registerListener { restriction ->
                            runOnUiThread {
                                allowed = !restriction.isRequiresDistractionOptimization
                                message = if (allowed) "조작 가능 상태" else "주행 중 · 조작 잠금"
                            }
                        }
                        val restriction = ux?.currentCarUxRestrictions
                        allowed = restriction != null && !restriction.isRequiresDistractionOptimization
                        message = if (allowed) "조작 가능 상태" else "주행 제한 또는 확인 불가"
                    } catch (e: Exception) {
                        allowed = false
                        message = "차량 UX 상태 확인 실패: ${e.javaClass.simpleName}"
                    }
                }
            }
        }
    }

    private fun startProbe() {
        if (!allowed || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            message = "위치 권한 또는 차량 상태 확인 필요"
            return
        }
        startForegroundService(Intent(this, TripProbeService::class.java))
        message = "탐험 검증 시작 요청"
    }

    override fun onStop() {
        try { ux?.unregisterListener() } catch (_: Exception) { }
        ux = null
        car?.disconnect()
        car = null
        allowed = false
        super.onStop()
    }
}
