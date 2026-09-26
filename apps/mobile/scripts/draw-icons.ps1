<#
  Draws MedOS's icons: the launcher icon, its adaptive foreground and themed
  (monochrome) layer, the splash mark, and the home-screen shortcut icons.

    powershell -ExecutionPolicy Bypass -File apps/mobile/scripts/draw-icons.ps1

  Windows only (System.Drawing). Writes into assets/images and assets/shortcuts;
  the next `npm run apk` or prebuild puts them into the Android resources.
#>
Add-Type -AssemblyName System.Drawing

$assets = Join-Path $PSScriptRoot '../assets'
$Out = Join-Path $assets 'images'
$Shortcuts = Join-Path $assets 'shortcuts'
$Font = Join-Path $PSScriptRoot '../../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'

$teal = [System.Drawing.ColorTranslator]::FromHtml('#0E4A5F')
$white = [System.Drawing.Color]::White

function Add-RoundRect($path, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $d = 2 * $r
  $path.StartFigure()
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
}

# A plus sign: two rounded bars, filled as their union.
function Draw-Cross($g, [float]$cx, [float]$cy, [float]$span, [bool]$pulse, $cutColor) {
  $t = $span * 0.34
  $r = $t * 0.26
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.FillMode = [System.Drawing.Drawing2D.FillMode]::Winding
  Add-RoundRect $path ($cx - $t / 2) ($cy - $span / 2) $t $span $r
  Add-RoundRect $path ($cx - $span / 2) ($cy - $t / 2) $span $t $r
  $brush = New-Object System.Drawing.SolidBrush $white
  $g.FillPath($brush, $path)
  if ($pulse) {
    # A heartbeat through the crossbar, in the background's colour.
    $u = $span / 2
    $pts = @(
      @(-0.78, 0.00), @(-0.30, 0.00), @(-0.20, -0.12), @(-0.10, 0.00),
      @(-0.02, 0.00), @(0.08, -0.46), @(0.20, 0.34), @(0.30, 0.00), @(0.78, 0.00)
    ) | ForEach-Object { New-Object System.Drawing.PointF ([float]($cx + $_[0] * $u)), ([float]($cy + $_[1] * $u)) }
    $pen = New-Object System.Drawing.Pen $cutColor, ([float]($span * 0.052))
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLines($pen, [System.Drawing.PointF[]]$pts)
  }
}

function New-Canvas([int]$size, $background) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  if ($background) { $g.Clear($background) } else { $g.Clear([System.Drawing.Color]::Transparent) }
  return @($bmp, $g)
}

function Save($pair, $file) {
  $pair[1].Dispose()
  $pair[0].Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $pair[0].Dispose()
}

# Adaptive icon foreground: the background colour comes from app.json. The mark
# stays well inside the 66/108 safe zone that every launcher mask keeps.
$c = New-Canvas 1024 $null
Draw-Cross $c[1] 512 512 400 $true $teal
Save $c (Join-Path $Out 'android-icon-foreground.png')

# Themed (monochrome) icon: only the alpha counts, so no heartbeat cut.
$c = New-Canvas 432 $null
Draw-Cross $c[1] 216 216 186 $false $teal
Save $c (Join-Path $Out 'android-icon-monochrome.png')

# Legacy / store icon: full-bleed square, the launcher rounds it.
$c = New-Canvas 1024 $teal
Draw-Cross $c[1] 512 512 520 $true $teal
Save $c (Join-Path $Out 'icon.png')

# Splash: the mark alone, on the splash's teal.
$c = New-Canvas 384 $null
Draw-Cross $c[1] 192 192 344 $true $teal
Save $c (Join-Path $Out 'splash-icon.png')

# Home-screen shortcuts: Ionicons glyphs, as the app itself draws them.
$fonts = New-Object System.Drawing.Text.PrivateFontCollection
$fonts.AddFontFile($Font)
$family = $fonts.Families[0]

# name -> Ionicons codepoint
$glyphs = [ordered]@{
  capture = 0xF293   # create-outline
  new_patient = 0xF4A7 # person-add-outline
  patients = 0xF4A3  # people-outline
  shift = 0xF5DE     # time-outline
}

function Draw-Glyph($g, [int]$code, [float]$cx, [float]$cy, [float]$box) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $text = [char]::ConvertFromUtf32($code)
  $path.AddString($text, $family, 0, 100, (New-Object System.Drawing.PointF 0, 0), [System.Drawing.StringFormat]::GenericTypographic)
  $b = $path.GetBounds()
  $scale = $box / [Math]::Max($b.Width, $b.Height)
  $m = New-Object System.Drawing.Drawing2D.Matrix
  $m.Translate($cx, $cy)
  $m.Scale($scale, $scale)
  $m.Translate(-($b.X + $b.Width / 2), -($b.Y + $b.Height / 2))
  $path.Transform($m)
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)), $path)
}

function New-ShortcutCanvas([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  return @($bmp, $g)
}

foreach ($name in $glyphs.Keys) {
  # Adaptive foreground: 108dp canvas at 4x; the glyph sits in the middle third.
  $c = New-ShortcutCanvas 432
  Draw-Glyph $c[1] $glyphs[$name] 216 216 150
  $c[1].Dispose(); $c[0].Save((Join-Path $Shortcuts "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png); $c[0].Dispose()

  # Android 7.1 has no adaptive icons: the same glyph on a round teal badge.
  $c = New-ShortcutCanvas 192
  $c[1].FillEllipse((New-Object System.Drawing.SolidBrush $teal), 4, 4, 184, 184)
  Draw-Glyph $c[1] $glyphs[$name] 96 96 92
  $c[1].Dispose(); $c[0].Save((Join-Path $Shortcuts "$name-legacy.png"), [System.Drawing.Imaging.ImageFormat]::Png); $c[0].Dispose()
}
