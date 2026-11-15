package dev.pleos.letspleo

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Entity(tableName = "pending_trips")
data class PendingTripEntity(
    @PrimaryKey val id: String,
    val payload: String,
    val savedAt: Long,
)

@Entity(tableName = "active_trips")
data class ActiveTripEntity(
    @PrimaryKey val id: String,
    val startedAt: Long,
    val movingSeconds: Int,
    val lastConfirmedAt: Long,
)

@Dao
interface PendingTripDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    fun insert(trip: PendingTripEntity)

    @Query("SELECT * FROM pending_trips ORDER BY savedAt, id")
    fun all(): List<PendingTripEntity>

    @Query("DELETE FROM pending_trips WHERE id = :id")
    fun delete(id: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun saveActive(trip: ActiveTripEntity)

    @Query("SELECT * FROM active_trips ORDER BY startedAt")
    fun active(): List<ActiveTripEntity>

    @Query("DELETE FROM active_trips WHERE id = :id")
    fun deleteActive(id: String)
}

@Database(entities = [PendingTripEntity::class, ActiveTripEntity::class], version = 2, exportSchema = true)
abstract class TripDatabase : RoomDatabase() {
    abstract fun pendingTrips(): PendingTripDao

    companion object {
        @Volatile private var instance: TripDatabase? = null
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS `active_trips` (`id` TEXT NOT NULL, `startedAt` INTEGER NOT NULL, `movingSeconds` INTEGER NOT NULL, `lastConfirmedAt` INTEGER NOT NULL, PRIMARY KEY(`id`))")
            }
        }

        fun get(context: Context): TripDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, TripDatabase::class.java, "lets-pleo-trips.db")
                .addMigrations(MIGRATION_1_2)
                .build().also { instance = it }
        }
    }
}
