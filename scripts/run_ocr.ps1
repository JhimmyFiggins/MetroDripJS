param(
    [string]$imagePath = "C:\Users\Kim Chim\.gemini\antigravity\brain\4a579481-3819-4eb2-a9e9-1c521c7daa21\.user_uploaded\media_1793593000234_c9df69d7.jpg"
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { 
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Await($asyncOp, $type) {
    $m = $asTaskGeneric.MakeGenericMethod($type)
    $netTask = $m.Invoke($null, @($asyncOp))
    $netTask.Wait()
    return $netTask.Result
}

[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null

$imagePath = "C:\Users\Kim Chim\.gemini\antigravity\brain\4a579481-3819-4eb2-a9e9-1c521c7daa21\.user_uploaded\media_1793593000234_c9df69d7.jpg"

try {
    $asyncOp = [Windows.Storage.StorageFile]::GetFileFromPathAsync($imagePath)
    $file = Await $asyncOp ([Windows.Storage.StorageFile])

    $asyncOp = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read)
    $stream = Await $asyncOp ([Windows.Storage.Streams.IRandomAccessStream])

    $asyncOp = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)
    $decoder = Await $asyncOp ([Windows.Graphics.Imaging.BitmapDecoder])

    $asyncOp = $decoder.GetSoftwareBitmapAsync()
    $softwareBitmap = Await $asyncOp ([Windows.Graphics.Imaging.SoftwareBitmap])

    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US"))
    $asyncOp = $engine.RecognizeAsync($softwareBitmap)
    $ocrResult = Await $asyncOp ([Windows.Media.Ocr.OcrResult])

    Write-Host "=== OCR RESULTS ==="
    foreach ($line in $ocrResult.Lines) {
        Write-Host $line.Text
    }
} catch {
    Write-Host "Error: $_"
    Write-Host $_.ScriptStackTrace
}