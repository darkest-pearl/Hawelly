package com.hawelly.sender.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape

private val HawellyColors = lightColorScheme(
    primary = Color(0xFF007C9E),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDDF3F8),
    onPrimaryContainer = Color(0xFF003744),
    secondary = Color(0xFF47636B),
    background = Color(0xFFF4F7F8),
    surface = Color.White,
    surfaceVariant = Color(0xFFE9EFF1),
    onSurface = Color(0xFF122126),
    onSurfaceVariant = Color(0xFF56666B),
    error = Color(0xFFB42335),
    outline = Color(0xFFB8C5C9)
)

private val BaseTypography = Typography()
private val HawellyTypography = Typography(
    headlineLarge = BaseTypography.headlineLarge.copy(
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.8).sp,
        lineHeight = 38.sp
    ),
    headlineMedium = BaseTypography.headlineMedium.copy(
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.5).sp,
        lineHeight = 34.sp
    ),
    headlineSmall = BaseTypography.headlineSmall.copy(
        fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.3).sp
    ),
    titleLarge = BaseTypography.titleLarge.copy(
        fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.25).sp
    ),
    bodyLarge = BaseTypography.bodyLarge.copy(lineHeight = 24.sp),
    bodyMedium = BaseTypography.bodyMedium.copy(lineHeight = 21.sp)
)

private val HawellyShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

@Composable
fun HawellyTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = HawellyColors,
        typography = HawellyTypography,
        shapes = HawellyShapes,
        content = content
    )
}
