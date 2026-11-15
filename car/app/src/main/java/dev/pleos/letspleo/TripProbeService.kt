package dev.pleos.letspleo

import ai.pleos.playground.location.fused.FusedLocation
import ai.pleos.playground.location.fused.listener.FusedLocationListener
import ai.pleos.playground.location.fused.model.LocationData
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.car.Car
import android.car.VehiclePropertyIds
import android.car.hardware.property.CarPropertyManager
import android.content.Intent
import android.os.IBinder
import android.util.Log

class TripProbeService : Service() {
    private var car: Car? = null
    private var properties: CarPropertyManager? = null
    private var fused: FusedLocation? = null
    private var locationListener: FusedLocationListener? = null
    private val carCallback = object : CarPropertyManager.CarPropertyEventCallback {
        override fun onChangeEvent(value: android.car.hardware.CarPropertyValue<*>) {
            Log.i(TAG, "property=${value.propertyId} value=${value.value}")
        }
        override fun onErrorEvent(propertyId: Int, areaId: Int) {
            Log.w(TAG, "property error=$propertyId area=$areaId")
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "탐험 검증", NotificationManager.IMPORTANCE_LOW))
        val notification = Notification.Builder(this, CHANNEL)
            .setContentTitle("렛츠 플레오 탐험 검증 중")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .build()
        startForeground(1001, notification)
        try {
            car = Car.createCar(this)
            properties = car?.getCarManager(Car.PROPERTY_SERVICE) as? CarPropertyManager
            for (id in listOf(VehiclePropertyIds.PERF_VEHICLE_SPEED, VehiclePropertyIds.GEAR_SELECTION)) {
                try {
                    val supported = properties?.getCarPropertyConfig(id) != null
                    Log.i(TAG, "property=$id supported=$supported")
                    if (supported) properties?.registerCallback(carCallback, id, CarPropertyManager.SENSOR_RATE_ONCHANGE)
                } catch (e: Exception) { Log.w(TAG, "property=$id unavailable", e) }
            }
            val sdk = FusedLocation(this)
            Log.i(TAG, "FusedLocation supported=${sdk.isSupported()}")
            if (sdk.isSupported()) {
                sdk.initialize()
                fused = sdk
                val listener = object : FusedLocationListener {
                    override fun onChanged(location: LocationData?) {
                        Log.i(TAG, "location received=${location != null}")
                    }
                    override fun onError(exception: Exception) { Log.w(TAG, "location error", exception) }
                }
                locationListener = listener
                sdk.registerFusedLocationCallback(listener)
            }
        } catch (e: Exception) {
            Log.e(TAG, "probe failed", e)
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        try { properties?.unregisterCallback(carCallback) } catch (_: Exception) { }
        try { locationListener?.let { fused?.unregisterFusedLocationCallback(it) } } catch (_: Exception) { }
        try { fused?.release() } catch (_: Exception) { }
        try { car?.disconnect() } catch (_: Exception) { }
        super.onDestroy()
    }

    companion object { private const val CHANNEL = "lets_pleo_trip_probe"; private const val TAG = "LetsPleoProbe" }
}
