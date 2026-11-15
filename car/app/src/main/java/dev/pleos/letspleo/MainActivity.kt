package dev.pleos.letspleo

import android.Manifest
import android.app.Activity
import android.car.Car
import android.car.VehicleGear
import android.car.VehiclePropertyIds
import android.car.drivingstate.CarUxRestrictionsManager
import android.car.hardware.property.CarPropertyManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import android.os.SystemClock
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue

class MainActivity : ComponentActivity() {
    private var message by mutableStateOf("차량 상태 확인 중")
    private var allowed by mutableStateOf(false)
    private var gear by mutableStateOf<Int?>(null)
    private var speed by mutableStateOf<Float?>(null)
    private val parked: Boolean get() = allowed && gear == VehicleGear.GEAR_PARK && speed?.let { it.isFinite() && kotlin.math.abs(it) < 1f } == true
    private var pairing by mutableStateOf(false)
    private var active by mutableStateOf(false)
    private var movingSeconds by mutableStateOf(0)
    private var collectedMaterials by mutableStateOf<Map<String, Int>>(emptyMap())
    private var collectionConnected by mutableStateOf(true)
    private var arrival by mutableStateOf<JourneyReceipt.Snapshot?>(null)
    private var collectionHint by mutableStateOf("")
    private var locationGranted by mutableStateOf(false)
    private val handler = Handler(Looper.getMainLooper())
    private var propertyManager: CarPropertyManager? = null
    private var propertyCallback: CarPropertyManager.CarPropertyEventCallback? = null
    private val refresh = object : Runnable {
        override fun run() {
            active = TripProbeService.isActive
            movingSeconds = TripProbeService.collectedMovingSeconds
            collectedMaterials = TripProbeService.collectedMaterials
            collectionConnected = TripProbeService.collectionConnected
            arrival = JourneyReceipt.read(this@MainActivity)
            collectionHint = TripProbeService.capabilityMessage
            locationGranted = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            handler.postDelayed(this, 1000)
        }
    }
    private var pairCode by mutableStateOf("")
    private var paired by mutableStateOf(false)
    private var car: Car? = null
    private var ux: CarUxRestrictionsManager? = null
    private var connectionGeneration = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.i("LetsPleoActivity", "onCreate started")
        paired = ServerApi(this).token() != null
        Log.i("LetsPleoActivity", "session loaded")
        if (!TripProbeService.isActive) {
            Thread {
                runCatching {
                    val recovered = TripSync.recoverInterrupted(this)
                    if (!TripSync.uploadPending(this)) TripSync.schedule(this)
                    if (recovered > 0) runOnUiThread { message = "이전 탐험 ${recovered}건 복원됨" }
                }.onFailure { Log.w("LetsPleoActivity", "trip recovery pending", it) }
            }.start()
        }
        setContent {
            CarHomeScreen(
                message = if (active && collectionHint.isNotBlank()) collectionHint else message,
                parked = parked,
                paired = paired,
                pairing = pairing,
                active = active,
                movingSeconds = movingSeconds,
                collectedMaterials = collectedMaterials,
                collectionConnected = collectionConnected,
                arrival = arrival,
                locationGranted = locationGranted,
                pairCode = pairCode,
                onKey = { key ->
                    if (parked && !pairing) {
                        if (key == "지움") pairCode = pairCode.dropLast(1)
                        else if (pairCode.length < 8) pairCode += key
                    }
                },
                onPair = { pair() },
                onStart = { startProbe() },
                onStop = { stopProbe() },
                onPermission = {
                    if (checkParked()) requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), 1)
                },
                onRetry = {
                    if (car == null) connectCar()
                    else if (parked) message = "모바일의 여행 탭에서 새 연결 코드를 받아 주세요"
                },
            )
        }
        Log.i("LetsPleoActivity", "content attached")
    }

    override fun onStart() {
        super.onStart()
        Log.i("LetsPleoActivity", "onStart")
        connectCar()
        handler.post(refresh)
    }

    private fun connectCar() {
        val generation = ++connectionGeneration
        car = try {
            Car.createCar(this, Handler(Looper.getMainLooper()), Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { connected, ready ->
                if (generation != connectionGeneration) return@createCar
                if (!ready) {
                    allowed = false
                    gear = null
                    speed = null
                    message = "차량 연결이 끊겼어요. 연결되면 다시 확인할게요."
                } else {
                    try {
                        attachSignals(connected, generation)
                        ux = connected.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as CarUxRestrictionsManager
                        ux?.registerListener { restriction ->
                            runOnUiThread {
                                if (generation != connectionGeneration) return@runOnUiThread
                                allowed = !restriction.isRequiresDistractionOptimization
                                Log.i("LetsPleoActivity", "ux restricted=${!allowed} receivedAt=${SystemClock.elapsedRealtime()}")
                            }
                        }
                        val restriction = ux?.currentCarUxRestrictions
                        allowed = restriction != null && !restriction.isRequiresDistractionOptimization
                        message = "주차 후 탐험을 시작하면 이동 기록을 자동으로 모아요"
                        Log.i("LetsPleoActivity", "ux initialRestricted=${!allowed}")
                    } catch (e: Exception) {
                        allowed = false
                        message = if (e is SecurityException) "차량 신호 권한이 없어요. 앱 권한을 확인해 주세요." else e.message?.takeIf { it.startsWith("이 차량") } ?: "차량 상태를 확인할 수 없어요. 앱을 다시 열어 주세요."
                    }
                }
            }
        } catch (e: Exception) {
            allowed = false
            message = "차량 연결을 시작하지 못했어요. 다시 시도해 주세요."
            null
        }
    }

    private fun attachSignals(connected: Car, generation: Int) {
        detachSignals()
        val manager = connected.getCarManager(Car.PROPERTY_SERVICE) as? CarPropertyManager
            ?: error("Vehicle properties unavailable")
        propertyManager = manager
        for (id in listOf(VehiclePropertyIds.GEAR_SELECTION, VehiclePropertyIds.PERF_VEHICLE_SPEED)) {
            check(manager.getCarPropertyConfig(id) != null) { "이 차량은 필수 속도·기어 신호를 지원하지 않아 탐험을 시작할 수 없어요." }
        }
        val callback = object : CarPropertyManager.CarPropertyEventCallback {
            override fun onChangeEvent(value: android.car.hardware.CarPropertyValue<*>) {
                if (generation != connectionGeneration) return
                if (value.status != android.car.hardware.CarPropertyValue.STATUS_AVAILABLE) {
                    gear = null
                    speed = null
                    message = "차량 신호를 기다리고 있어요. 수신되면 다시 시작할 수 있어요."
                    return
                }
                when (value.propertyId) {
                    VehiclePropertyIds.GEAR_SELECTION -> gear = (value.value as? Number)?.toInt()
                    VehiclePropertyIds.PERF_VEHICLE_SPEED -> speed = (value.value as? Number)?.toFloat()
                }
            }
            override fun onErrorEvent(propertyId: Int, areaId: Int) {
                if (generation != connectionGeneration) return
                gear = null
                speed = null
                message = "차량 신호를 기다리고 있어요. 수신되면 다시 시작할 수 있어요."
            }
        }
        propertyCallback = callback
        manager.registerCallback(callback, VehiclePropertyIds.GEAR_SELECTION, CarPropertyManager.SENSOR_RATE_ONCHANGE)
        manager.registerCallback(callback, VehiclePropertyIds.PERF_VEHICLE_SPEED, CarPropertyManager.SENSOR_RATE_NORMAL)
        gear = manager.getIntProperty(VehiclePropertyIds.GEAR_SELECTION, 0)
        speed = manager.getFloatProperty(VehiclePropertyIds.PERF_VEHICLE_SPEED, 0)
    }

    private fun detachSignals() {
        try { propertyCallback?.let { propertyManager?.unregisterCallback(it) } } catch (_: Exception) { }
        propertyCallback = null
        propertyManager = null
        gear = null
        speed = null
    }

    /** Re-read both UX restrictions and vehicle properties at the action boundary. */
    private fun checkParked(): Boolean {
        try {
            allowed = ux?.currentCarUxRestrictions?.isRequiresDistractionOptimization == false
            gear = propertyManager?.getIntProperty(VehiclePropertyIds.GEAR_SELECTION, 0)
            speed = propertyManager?.getFloatProperty(VehiclePropertyIds.PERF_VEHICLE_SPEED, 0)
        } catch (_: Exception) {
            allowed = false
            gear = null
            speed = null
        }
        if (!parked) message = "P에 두고 완전히 멈춘 뒤 이용해 주세요"
        return parked
    }

    private fun startProbe() {
        if (!checkParked() || TripProbeService.isActive) return
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            locationGranted = false
            message = "탐험을 시작하려면 위치 권한을 허용해 주세요"
            return
        }
        startForegroundService(Intent(this, TripProbeService::class.java))
        message = "탐험을 준비했어요. 출발하면 이동 기록을 모아요."
    }

    private fun stopProbe() {
        if (!checkParked() || !TripProbeService.isActive) return
        startService(Intent(this, TripProbeService::class.java).setAction(TripProbeService.ACTION_STOP))
        message = "탐험을 마무리하고 있어요. 보상은 모바일에서 확인해 주세요."
    }

    private fun pair() {
        if (!checkParked() || pairing || pairCode.length != 8) return
        pairing = true
        val code = pairCode
        message = "마을과 연결하고 있어요"
        Thread {
            val result = ServerApi(applicationContext).pair(code)
            runOnUiThread {
                pairing = false
                result.onSuccess { paired = true; pairCode = ""; message = "마을과 연결했어요. 이제 첫 탐험을 떠나 볼까요?" }
                    .onFailure { message = it.message ?: "연결할 수 없어요. 잠시 뒤 다시 시도해 주세요." }
            }
        }.start()
    }

    override fun onStop() {
        connectionGeneration++
        handler.removeCallbacks(refresh)
        detachSignals()
        try { ux?.unregisterListener() } catch (_: Exception) { }
        ux = null
        car?.disconnect()
        car = null
        allowed = false
        super.onStop()
    }
}
