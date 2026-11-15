plugins {
    id("com.android.application")
    kotlin("android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}
android {
    namespace = "dev.pleos.letspleo"
    compileSdk = 35
    useLibrary("android.car")
    defaultConfig {
        applicationId = "dev.pleos.letspleo"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        manifestPlaceholders["appLabel"] = "렛츠 플레오"
    }
    buildTypes {
        getByName("debug") { manifestPlaceholders["cleartextTraffic"] = "true" }
        getByName("release") { manifestPlaceholders["cleartextTraffic"] = "false" }
        create("demo") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".demo"
            matchingFallbacks += listOf("debug")
            manifestPlaceholders["appLabel"] = "렛츠 플레오 데모"
        }
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { jvmToolchain(17) }
dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.04.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("ai.pleos.playground:FusedLocation:1.1.3")
    implementation("androidx.room:room-runtime:2.8.5")
    ksp("androidx.room:room-compiler:2.8.5")
    testImplementation("junit:junit:4.13.2")
}
ksp { arg("room.schemaLocation", "$projectDir/schemas") }
