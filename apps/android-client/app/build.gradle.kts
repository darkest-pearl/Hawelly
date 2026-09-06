plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val productionApiBaseUrl = providers.gradleProperty("HAWELLY_API_BASE_URL")
    .orElse("https://api.hawelly.invalid")

android {
    namespace = "com.hawelly.sender"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hawelly.sender"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "1.0.1-beta"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:4000\"")
        }
        release {
            isMinifyEnabled = false
            buildConfigField("String", "API_BASE_URL", "\"${productionApiBaseUrl.get()}\"")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation("androidx.compose.ui:ui-android:1.7.0")
    implementation("androidx.compose.ui:ui-tooling-preview-android:1.7.0")
    implementation("androidx.compose.foundation:foundation-android:1.7.0")
    implementation("androidx.compose.material3:material3-android:1.3.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    debugImplementation("androidx.compose.ui:ui-tooling-android:1.7.0")
    debugImplementation("androidx.compose.ui:ui-test-manifest:1.7.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4-android:1.7.0")
}
