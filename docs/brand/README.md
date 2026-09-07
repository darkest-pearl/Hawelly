# Hawelly Android brand assets

`source/hawelly-logo-source-original.png` is the user-supplied 1024×1024 source artwork. It is retained so future assets can be regenerated without relying on an attachment path. The small `AI` badge in that source is not part of the Hawelly brand.

`hawelly-logo-master-1024.png` is the clean, opaque master: the badge is removed and the approved interwoven H is otherwise unchanged. `hawelly-store-icon-512.png` is the distribution/store derivative. `hawelly-mark-adaptive-foreground-1024.png` and `hawelly-mark-monochrome-1024.png` are transparent adaptive-icon masters.

Regenerate the derived PNGs from the repository root on Windows with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/android-client/tools/Generate-LauncherAssets.ps1
```

The script uses only the Windows `System.Drawing` runtime and introduces no application dependency. It deterministically repairs the badge area from neighboring navy pixels, extracts the original H, applies the Android adaptive safe-zone scale, and emits store, adaptive, monochrome, and legacy-density resources.
