package dev.pleos.letspleo

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.util.Log
import org.json.JSONObject

object TripSync {
    private const val JOB_ID = 4187

    /** Run on an IO thread. The server and Room row ID make retries idempotent. */
    fun uploadPending(context: Context): Boolean {
        val dao = TripDatabase.get(context).pendingTrips()
        for (saved in dao.all()) {
            val result = ServerApi(context).submitTrip(JSONObject(saved.payload))
            if (result.isFailure) {
                Log.w("LetsPleoProbe", "trip sync pending id=${saved.id}", result.exceptionOrNull())
                return false
            }
            JourneyReceipt.delivered(context, saved.id, result.getOrThrow())
            dao.delete(saved.id)
            Log.i("LetsPleoProbe", "trip synced id=${saved.id}")
        }
        return true
    }

    /** Close only the last confirmed segment of an interrupted trip. Never fill the missing interval. */
    fun recoverInterrupted(context: Context): Int {
        val database = TripDatabase.get(context)
        val dao = database.pendingTrips()
        var recovered = 0
        for (active in dao.active()) {
            if (active.movingSeconds <= 0) {
                dao.deleteActive(active.id)
                continue
            }
            val payload = JSONObject().put("id", active.id).put("startedAt", active.startedAt)
                .put("endedAt", active.lastConfirmedAt).put("movingSeconds", active.movingSeconds).put("collection", true)
            database.runInTransaction {
                dao.insert(PendingTripEntity(active.id, payload.toString(), System.currentTimeMillis()))
                dao.deleteActive(active.id)
            }
            JourneyReceipt.record(context, active.id, active.movingSeconds)
            recovered++
            Log.i("LetsPleoProbe", "interrupted trip recovered id=${active.id} movingSeconds=${active.movingSeconds}")
        }
        return recovered
    }

    fun schedule(context: Context) {
        val job = JobInfo.Builder(JOB_ID, ComponentName(context, TripSyncJobService::class.java))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPersisted(true)
            .setBackoffCriteria(30_000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
            .build()
        val result = context.getSystemService(JobScheduler::class.java).schedule(job)
        if (result != JobScheduler.RESULT_SUCCESS) Log.w("LetsPleoProbe", "trip sync job scheduling failed")
    }
}

class TripSyncJobService : JobService() {
    @Volatile private var stopped = false

    override fun onStartJob(params: JobParameters): Boolean {
        stopped = false
        Thread {
            val complete = runCatching { TripSync.uploadPending(this) }.getOrElse {
                Log.w("LetsPleoProbe", "trip sync job failed", it)
                false
            }
            if (!stopped) jobFinished(params, !complete)
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        stopped = true
        return true
    }
}
