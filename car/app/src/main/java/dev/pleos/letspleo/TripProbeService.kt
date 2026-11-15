package dev.pleos.letspleo

import ai.pleos.playground.location.fused.FusedLocation
import ai.pleos.playground.location.fused.listener.FusedLocationListener
import ai.pleos.playground.location.fused.model.LocationData
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.car.Car
import android.car.VehicleGear
import android.car.VehiclePropertyIds
import android.car.hardware.property.CarPropertyManager
import android.content.Intent
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

class TripProbeService : Service() {
    private var car: Car? = null
    private var properties: CarPropertyManager? = null
    private var fused: FusedLocation? = null
    private var locationListener: FusedLocationListener? = null
    private val handler = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private val tripId = UUID.randomUUID().toString()
    private val startedAt = System.currentTimeMillis()
    private val tripState = TripState(VehicleGear.GEAR_PARK)
    private val travelTheme = TravelThemeState()
    private var finished = false
    private var running = false
    private var connectionGeneration = 0
    private var lastSpeedCallbackAt = SystemClock.elapsedRealtime()
    private var lastReconnectAt = 0L
    private var lastCollectionSeconds = 0
    private var lastCheckpointSeconds = 0
    private var lastLoggedMovingBucket = -1
    private val tick = object : Runnable {
        override fun run() {
            if (finished) return
            val elapsed = SystemClock.elapsedRealtime()
            if (tripState.tick(elapsed)) finishTrip()
            collectedMovingSeconds = tripState.movingSeconds
            if (!finished && tripState.movingSeconds >= lastCheckpointSeconds + 5) {
                lastCheckpointSeconds = tripState.movingSeconds
                val confirmed = tripState.movingSeconds
                val confirmedAt = System.currentTimeMillis()
                io.execute {
                    TripDatabase.get(this@TripProbeService).pendingTrips()
                        .saveActive(ActiveTripEntity(tripId, startedAt, confirmed, confirmedAt))
                }
            }
            if (!finished && tripState.movingSeconds >= lastCollectionSeconds + 15) {
                lastCollectionSeconds = tripState.movingSeconds
                val checkpoint = JSONObject().put("id", tripId).put("startedAt", startedAt)
                    .put("endedAt", System.currentTimeMillis()).put("movingSeconds", tripState.movingSeconds)
                io.execute {
                    ServerApi(this@TripProbeService).collect(checkpoint)
                        .onSuccess { collectedMaterials = it; collectionConnected = true }
                        .onFailure { collectionConnected = false; Log.w(TAG, "collection pending", it) }
                }
            }
            if (!finished && elapsed - lastSpeedCallbackAt >= 15_000 && elapsed - lastReconnectAt >= 15_000) {
                lastReconnectAt = elapsed
                Log.w(TAG, "speed callback stale; reconnecting vehicle service")
                reconnectCar()
            }
            if (!finished) handler.postDelayed(this, 1000)
        }
    }
    private val carCallback = object : CarPropertyManager.CarPropertyEventCallback {
        override fun onChangeEvent(value: android.car.hardware.CarPropertyValue<*>) {
            handler.post {
                if (finished || !running) return@post
                if (value.status != android.car.hardware.CarPropertyValue.STATUS_AVAILABLE) {
                    if (value.propertyId == VehiclePropertyIds.PERF_VEHICLE_SPEED) tripState.onSpeedUnavailable()
                    else tripState.onSignalDisconnected()
                    return@post
                }
                when (value.propertyId) {
                    VehiclePropertyIds.PERF_VEHICLE_SPEED -> {
                        val sample = (value.value as? Number)?.toFloat()
                        if (sample != null) {
                            lastSpeedCallbackAt = SystemClock.elapsedRealtime()
                            tripState.onSpeed(sample, lastSpeedCallbackAt)
                        }
                    }
                    VehiclePropertyIds.GEAR_SELECTION -> (value.value as? Number)?.toInt()?.let(tripState::onGear)
                }
                val bucket = tripState.movingSeconds / 15
                if (value.propertyId == VehiclePropertyIds.GEAR_SELECTION || tripState.movingSeconds > 0 && bucket != lastLoggedMovingBucket) {
                    Log.i(TAG, "property=${value.propertyId} value=${value.value} movingSeconds=${tripState.movingSeconds}")
                    lastLoggedMovingBucket = bucket
                }
            }
        }
        override fun onErrorEvent(propertyId: Int, areaId: Int) {
            handler.post {
                if (propertyId == VehiclePropertyIds.PERF_VEHICLE_SPEED) tripState.onSpeedUnavailable()
                else tripState.onSignalDisconnected()
            }
            Log.w(TAG, "property error=$propertyId area=$areaId")
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            if (running) finishTrip() else stopSelf()
            return START_NOT_STICKY
        }
        if (running) return START_NOT_STICKY
        if (ServerApi(this).token() == null) { stopSelf(); return START_NOT_STICKY }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "여행 기록", NotificationManager.IMPORTANCE_LOW))
        val notification = Notification.Builder(this, CHANNEL)
            .setContentTitle("렛츠 플레오 · 여행 기록을 담고 있어요")
            .setContentText("이동 기록은 자동으로 저장돼요. 도착 후 모바일에서 확인하세요.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .build()
        startForeground(1001, notification)
        capabilityMessage = "위치와 차량 신호를 확인하고 있어요"
        running = true
        collectedMovingSeconds = 0
        collectedMaterials = emptyMap()
        collectionConnected = true
        isActive = true
        handler.postDelayed(tick, 1000)
        io.execute {
            TripSync.recoverInterrupted(this)
            syncPending()
        }
        connectCar()
        try {
            val sdk = FusedLocation(this)
            Log.i(TAG, "FusedLocation supported=${sdk.isSupported()}")
            if (sdk.isSupported()) {
                sdk.initialize()
                capabilityMessage = "위치 테마와 기본 재료를 함께 모아요"
                fused = sdk
                val listener = object : FusedLocationListener {
                    override fun onChanged(location: LocationData?) {
                        Log.i(TAG, "location received=${location != null}")
                        handler.post {
                            if (finished || !running) return@post
                            capabilityMessage = if (location == null) "위치를 기다리고 있어요. 기본 재료 수집은 계속돼요." else "위치 테마와 기본 재료를 함께 모아요"
                            if (location == null) travelTheme.unavailable()
                            else travelTheme.update(location.latitude, location.longitude, location.timestampMillis,
                                System.currentTimeMillis(), SystemClock.elapsedRealtime())
                        }
                    }
                    override fun onError(exception: Exception) {
                        handler.post {
                            travelTheme.unavailable()
                            capabilityMessage = "위치 신호가 없어요. 기본 재료를 모으며 재수신을 기다려요."
                        }
                        Log.w(TAG, "location error", exception)
                    }
                }
                locationListener = listener
                sdk.registerFusedLocationCallback(listener)
            } else capabilityMessage = "이 차량은 위치 테마를 지원하지 않아요. 기본 재료는 모을 수 있어요."
        } catch (e: Exception) {
            capabilityMessage = if (e is SecurityException) "위치 권한을 확인해 주세요. 기본 재료는 계속 모아요." else "위치 연결을 시작하지 못했어요. 기본 재료는 계속 모아요."
            Log.e(TAG, "location unavailable; base reward remains possible", e)
        }
        return START_NOT_STICKY
    }

    private fun connectCar() {
        val generation = ++connectionGeneration
        try {
            car = Car.createCar(this, handler, Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { connected, ready ->
                if (generation != connectionGeneration || !running || finished) return@createCar
                if (!ready) {
                    detachProperties()
                    Log.w(TAG, "car service disconnected; movement paused")
                } else {
                    attachProperties(connected)
                }
            }
            if (car == null) Log.w(TAG, "car connection unavailable")
        } catch (e: Exception) {
            Log.e(TAG, "car connection failed", e)
        }
    }

    private fun reconnectCar() {
        connectionGeneration++
        detachProperties()
        try { car?.disconnect() } catch (e: Exception) { Log.w(TAG, "car disconnect failed", e) }
        car = null
        connectCar()
    }

    private fun attachProperties(connected: Car) {
        detachProperties()
        try {
            val manager = connected.getCarManager(Car.PROPERTY_SERVICE) as? CarPropertyManager
            properties = manager
            for (id in listOf(VehiclePropertyIds.PERF_VEHICLE_SPEED, VehiclePropertyIds.GEAR_SELECTION)) {
                try {
                    val supported = manager?.getCarPropertyConfig(id) != null
                    Log.i(TAG, "property=$id supported=$supported")
                    if (supported) manager?.registerCallback(carCallback, id, if (id == VehiclePropertyIds.PERF_VEHICLE_SPEED) CarPropertyManager.SENSOR_RATE_NORMAL else CarPropertyManager.SENSOR_RATE_ONCHANGE)
                } catch (e: Exception) { Log.w(TAG, "property=$id unavailable", e) }
            }
            Log.i(TAG, "car properties subscribed")
        } catch (e: Exception) { Log.w(TAG, "car properties unavailable", e) }
    }

    private fun detachProperties() {
        try { properties?.unregisterCallback(carCallback) } catch (_: Exception) { }
        properties = null
        tripState.onSignalDisconnected()
    }

    private fun finishTrip() {
        if (finished) return
        finished = true
        handler.removeCallbacks(tick)
        if (tripState.movingSeconds == 0) { stopSelf(); return }
        val trip = JSONObject().put("id", tripId).put("startedAt", startedAt)
            .put("endedAt", System.currentTimeMillis()).put("movingSeconds", tripState.movingSeconds).put("collection", true)
        travelTheme.current(SystemClock.elapsedRealtime())?.let { trip.put("theme", it) }
        val movingSeconds = tripState.movingSeconds
        io.execute {
            try {
                val database = TripDatabase.get(this)
                database.runInTransaction {
                    database.pendingTrips().insert(PendingTripEntity(tripId, trip.toString(), System.currentTimeMillis()))
                    database.pendingTrips().deleteActive(tripId)
                }
                Log.i(TAG, "trip persisted id=$tripId movingSeconds=$movingSeconds")
                JourneyReceipt.record(this, tripId, movingSeconds)
                syncPending()
            } catch (e: Exception) { Log.e(TAG, "trip persistence failed", e) }
            finally { stopSelf() }
        }
    }

    private fun syncPending() {
        if (!TripSync.uploadPending(this)) TripSync.schedule(this)
    }

    override fun onDestroy() {
        running = false
        isActive = false
        connectionGeneration++
        handler.removeCallbacks(tick)
        detachProperties()
        try { locationListener?.let { fused?.unregisterFusedLocationCallback(it) } } catch (_: Exception) { }
        try { fused?.release() } catch (_: Exception) { }
        try { car?.disconnect() } catch (_: Exception) { }
        io.shutdown()
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "dev.pleos.letspleo.STOP_TRIP"
        @Volatile var isActive = false
        @Volatile var collectedMaterials: Map<String, Int> = emptyMap()
            private set
        @Volatile var collectionConnected = true
            private set
        @Volatile var collectedMovingSeconds = 0
            private set
        @Volatile var capabilityMessage = ""
            private set
        private const val CHANNEL = "lets_pleo_trip_probe"
        private const val TAG = "LetsPleoProbe"
    }
}
