@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

set "RUNTIME_DIR=%CD%\.ziwei-dev"
set "NEXT_PID_FILE=%RUNTIME_DIR%\server.pid"
set "KIMI_PID_FILE=%RUNTIME_DIR%\kimi.pid"
set "FOUND=0"
set "STOP_ERROR=0"

if exist "%NEXT_PID_FILE%" call :stop_one "%NEXT_PID_FILE%" "npm(\.cmd)?\s+run\s+dev" "紫微斗数"
if exist "%KIMI_PID_FILE%" call :stop_one "%KIMI_PID_FILE%" "kimi(\.exe)?\s+web" "Kimi Code 本地服务"

if "%FOUND%"=="0" echo 当前没有由 start.bat 启动的服务。
if "%STOP_ERROR%"=="1" (
    echo [错误] 部分服务未能正常关闭。
    pause
    exit /b 1
)

echo.
echo 关闭流程已完成。
pause
exit /b 0

:stop_one
set "TARGET_PID="
set "TARGET_MATCH=%~2"
set "TARGET_LABEL=%~3"
set "FOUND=1"
set /p TARGET_PID=<"%~1"
if not defined TARGET_PID (
    echo %TARGET_LABEL%的进程记录为空，已清理。
    del /q "%~1" >nul 2>&1
    exit /b 0
)

powershell.exe -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $env:TARGET_PID) -ErrorAction SilentlyContinue; if (-not $p) { exit 2 }; if ($p.CommandLine -match $env:TARGET_MATCH) { exit 0 }; exit 3"
set "PROCESS_STATE=%ERRORLEVEL%"

if "%PROCESS_STATE%"=="2" (
    echo %TARGET_LABEL%已经停止，正在清理进程记录。
    del /q "%~1" >nul 2>&1
    exit /b 0
)

if not "%PROCESS_STATE%"=="0" (
    echo [错误] %TARGET_LABEL%的进程记录已失效，为避免误关其他程序，本次未结束该进程。
    del /q "%~1" >nul 2>&1
    set "STOP_ERROR=1"
    exit /b 0
)

taskkill /PID "%TARGET_PID%" /T /F
if errorlevel 1 (
    echo [错误] %TARGET_LABEL%关闭失败。
    set "STOP_ERROR=1"
    exit /b 0
)

del /q "%~1" >nul 2>&1
echo [成功] %TARGET_LABEL%已关闭。
exit /b 0
