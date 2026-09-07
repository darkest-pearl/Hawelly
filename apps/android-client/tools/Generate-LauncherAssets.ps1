param(
    [string]$SourcePath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
if (-not $SourcePath) {
    $SourcePath = Join-Path $repoRoot "docs\brand\source\hawelly-logo-source-original.png"
}
$SourcePath = (Resolve-Path $SourcePath).Path
$brandDir = Join-Path $repoRoot "docs\brand"
$resDir = Join-Path $repoRoot "apps\android-client\app\src\main\res"

function New-ArgbBitmap([int]$Width, [int]$Height) {
    return [System.Drawing.Bitmap]::new(
        $Width,
        $Height,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
}

function Save-Png($Bitmap, [string]$Path) {
    $directory = Split-Path -Parent $Path
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Resize-Bitmap($Source, [int]$Width, [int]$Height) {
    $target = New-ArgbBitmap $Width $Height
    $graphics = [System.Drawing.Graphics]::FromImage($target)
    try {
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($Source, 0, 0, $Width, $Height)
    } finally {
        $graphics.Dispose()
    }
    return $target
}

function Clamp-Byte([double]$Value) {
    return [byte][Math]::Max(0, [Math]::Min(255, [Math]::Round($Value)))
}

$source = [System.Drawing.Bitmap]::new($SourcePath)
if ($source.Width -ne 1024 -or $source.Height -ne 1024) {
    $source.Dispose()
    throw "Expected a 1024x1024 source image."
}

try {
    # Preserve every source pixel except the badge. The replacement samples the
    # adjacent plain background and feathers only at the edge of the repair box.
    $clean = New-ArgbBitmap 1024 1024
    $graphics = [System.Drawing.Graphics]::FromImage($clean)
    try {
        $graphics.DrawImageUnscaled($source, 0, 0)
    } finally {
        $graphics.Dispose()
    }
    $left = 15
    $top = 15
    $right = 103
    $bottom = 89
    $feather = 8.0
    for ($y = $top; $y -le $bottom; $y++) {
        for ($x = $left; $x -le $right; $x++) {
            $distanceToEdge = [Math]::Min(
                [Math]::Min($x - $left, $right - $x),
                [Math]::Min($y - $top, $bottom - $y)
            )
            $repairWeight = [Math]::Min(1.0, $distanceToEdge / $feather)
            $original = $source.GetPixel($x, $y)
            $sampleX = 207 - $x
            $replacement = $source.GetPixel($sampleX, $y)
            $clean.SetPixel(
                $x,
                $y,
                [System.Drawing.Color]::FromArgb(
                    255,
                    (Clamp-Byte ($original.R * (1.0 - $repairWeight) + $replacement.R * $repairWeight)),
                    (Clamp-Byte ($original.G * (1.0 - $repairWeight) + $replacement.G * $repairWeight)),
                    (Clamp-Byte ($original.B * (1.0 - $repairWeight) + $replacement.B * $repairWeight))
                )
            )
        }
    }
    Save-Png $clean (Join-Path $brandDir "hawelly-logo-master-1024.png")

    # The source background is nearly solid navy. Average only the outer frame,
    # which is guaranteed not to contain the mark or the removed badge.
    [long]$sumR = 0
    [long]$sumG = 0
    [long]$sumB = 0
    [long]$sampleCount = 0
    for ($y = 0; $y -lt 1024; $y += 4) {
        for ($x = 0; $x -lt 1024; $x += 4) {
            if ($x -lt 160 -or $x -gt 864 -or $y -lt 160 -or $y -gt 864) {
                $pixel = $clean.GetPixel($x, $y)
                $sumR += $pixel.R
                $sumG += $pixel.G
                $sumB += $pixel.B
                $sampleCount++
            }
        }
    }
    $backgroundR = [double]$sumR / $sampleCount
    $backgroundG = [double]$sumG / $sampleCount
    $backgroundB = [double]$sumB / $sampleCount

    # Extract the original mark without changing its proportions. The narrow
    # transition band retains anti-aliased dark-ribbon edges without background
    # speckle. Extraction is restricted to the mark's known visual bounds.
    $extracted = New-ArgbBitmap 1024 1024
    for ($y = 180; $y -le 840; $y++) {
        for ($x = 200; $x -le 825; $x++) {
            $pixel = $clean.GetPixel($x, $y)
            $distance = [Math]::Sqrt(
                [Math]::Pow($pixel.R - $backgroundR, 2) +
                [Math]::Pow($pixel.G - $backgroundG, 2) +
                [Math]::Pow($pixel.B - $backgroundB, 2)
            )
            $alpha = if ($distance -le 7.0) {
                0
            } elseif ($distance -ge 24.0) {
                255
            } else {
                Clamp-Byte (255.0 * (($distance - 7.0) / 17.0))
            }
            if ($alpha -gt 0) {
                $extracted.SetPixel(
                    $x,
                    $y,
                    [System.Drawing.Color]::FromArgb($alpha, $pixel.R, $pixel.G, $pixel.B)
                )
            }
        }
    }

    # Android adaptive icons reserve the outer layer for OEM masks and parallax.
    # Scaling the unchanged source canvas to 75% places the full H, including its
    # gold tips, inside the recommended central safe circle.
    $adaptiveMaster = New-ArgbBitmap 1024 1024
    $graphics = [System.Drawing.Graphics]::FromImage($adaptiveMaster)
    try {
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($extracted, 128, 128, 768, 768)
    } finally {
        $graphics.Dispose()
    }
    Save-Png $adaptiveMaster (Join-Path $brandDir "hawelly-mark-adaptive-foreground-1024.png")

    $monochromeMaster = New-ArgbBitmap 1024 1024
    for ($y = 0; $y -lt 1024; $y++) {
        for ($x = 0; $x -lt 1024; $x++) {
            $alpha = $adaptiveMaster.GetPixel($x, $y).A
            if ($alpha -gt 0) {
                $monochromeMaster.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
            }
        }
    }
    Save-Png $monochromeMaster (Join-Path $brandDir "hawelly-mark-monochrome-1024.png")

    $store = Resize-Bitmap $clean 512 512
    try { Save-Png $store (Join-Path $brandDir "hawelly-store-icon-512.png") } finally { $store.Dispose() }

    $adaptive = Resize-Bitmap $adaptiveMaster 432 432
    try { Save-Png $adaptive (Join-Path $resDir "drawable-nodpi\ic_launcher_foreground.png") } finally { $adaptive.Dispose() }
    $monochrome = Resize-Bitmap $monochromeMaster 432 432
    try { Save-Png $monochrome (Join-Path $resDir "drawable-nodpi\ic_launcher_monochrome.png") } finally { $monochrome.Dispose() }

    $densitySizes = [ordered]@{
        "mipmap-mdpi" = 48
        "mipmap-hdpi" = 72
        "mipmap-xhdpi" = 96
        "mipmap-xxhdpi" = 144
        "mipmap-xxxhdpi" = 192
    }
    foreach ($entry in $densitySizes.GetEnumerator()) {
        $legacy = Resize-Bitmap $clean $entry.Value $entry.Value
        try {
            Save-Png $legacy (Join-Path $resDir "$($entry.Key)\ic_launcher.png")
        } finally {
            $legacy.Dispose()
        }

        $round = New-ArgbBitmap $entry.Value $entry.Value
        $graphics = [System.Drawing.Graphics]::FromImage($round)
        try {
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
            try {
                $path.AddEllipse(0, 0, $entry.Value, $entry.Value)
                $graphics.SetClip($path)
                $graphics.DrawImage($clean, 0, 0, $entry.Value, $entry.Value)
            } finally {
                $path.Dispose()
            }
        } finally {
            $graphics.Dispose()
        }
        try {
            Save-Png $round (Join-Path $resDir "$($entry.Key)\ic_launcher_round.png")
        } finally {
            $round.Dispose()
        }
    }
} finally {
    if ($null -ne $monochromeMaster) { $monochromeMaster.Dispose() }
    if ($null -ne $adaptiveMaster) { $adaptiveMaster.Dispose() }
    if ($null -ne $extracted) { $extracted.Dispose() }
    if ($null -ne $clean) { $clean.Dispose() }
    $source.Dispose()
}

Write-Output "Generated Hawelly brand and Android launcher assets from $SourcePath"
