$ErrorActionPreference = "Stop"

$jdkPath = "C:\Users\Kim Chim\.jdk\jdk-17.0.20.1+1"
$env:JAVA_HOME = $jdkPath
$env:PATH = "$jdkPath\bin;" + $env:PATH

Write-Host "Using Java from: $env:JAVA_HOME"
& java.exe -version

Set-Location "android"

Write-Host "Starting Gradle assembleRelease with NDK 27.1.12297006 and CMake 3.31.6..."
.\gradlew.bat assembleRelease --no-daemon "-Dorg.gradle.java.home=$jdkPath" "-Dandroid.ndkVersion=27.1.12297006" "-Dandroid.cmakeVersion=3.31.6"

Write-Host "Gradle build completed."
