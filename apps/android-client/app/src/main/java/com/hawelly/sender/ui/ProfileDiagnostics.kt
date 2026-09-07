package com.hawelly.sender.ui

import java.net.URI

fun diagnosticInformation(
    versionName: String,
    versionCode: Int,
    applicationId: String,
    androidVersion: String,
    deviceModel: String,
    apiHostname: String
): String = listOf(
    "Hawelly app version: $versionName",
    "Version code: $versionCode",
    "Application ID: $applicationId",
    "Android version: $androidVersion",
    "Device model: $deviceModel",
    "API hostname: $apiHostname"
).joinToString("\n")

fun supportUrl(webOrigin: String): String {
    val origin = URI(webOrigin)
    require(origin.scheme == "https" || origin.host in setOf("10.0.2.2", "localhost", "127.0.0.1"))
    require(origin.userInfo == null && origin.query == null && origin.fragment == null)
    require(origin.path.isNullOrEmpty() || origin.path == "/")
    return "${origin.scheme}://${origin.authority}/support"
}
