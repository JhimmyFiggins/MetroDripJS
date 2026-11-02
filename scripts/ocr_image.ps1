[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null

$imagePath = "C:\Users\Kim Chim\.gemini\antigravity\brain\4a579481-3819-4eb2-a9e9-1c521c7daa21\.user_uploaded\media_1793593000234_c9df69d7.jpg"

function Get-OcrText {
    param($path)
    $file = [Windows.Storage.StorageFile]::GetFileFromPathAsync($path).GetAwaiter().GetResult()
    $stream = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read).GetAwaiter().GetResult()
    $decoder = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream).GetAwaiter().GetResult()
    $softwareBitmap = $decoder.GetSoftwareBitmapAsync().GetAwaiter().GetResult()
    
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if (-not $engine) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US"))
    }
    $ocrResult = $engine.RecognizeAsync($softwareBitmap).GetAwaiter().GetResult()
    return $ocrResult.Text
}

try {
    $text = Get-OcrText $imagePath
    Write-Host "=== OCR EXTRACTED TEXT ==="
    Write-Host $text
} catch {
    Write-Host "OCR error: $_"
}