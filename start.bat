@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

if exist ".env.local" (
    for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env.local") do (
        if not "%%A"=="" set "%%A=%%B"
    )
)
rem 该项目变量已改名为 KIMI_CODE_LOCAL_URL，避免覆盖 Kimi Code 官方服务地址。
set "KIMI_CODE_BASE_URL="

set "PORT=3000"
set "APP_URL=http://127.0.0.1:%PORT%"
set "PROJECT_DIR=%CD%"
set "RUNTIME_DIR=%PROJECT_DIR%\.ziwei-dev"
set "PID_FILE=%RUNTIME_DIR%\server.pid"
set "STDOUT_LOG=%RUNTIME_DIR%\stdout.log"
set "STDERR_LOG=%RUNTIME_DIR%\stderr.log"
set "KIMI_PORT=58627"
set "KIMI_HEALTH_URL=http://127.0.0.1:%KIMI_PORT%/api/v1/healthz"
set "KIMI_PID_FILE=%RUNTIME_DIR%\kimi.pid"
set "KIMI_STDOUT_LOG=%RUNTIME_DIR%\kimi-stdout.log"
set "KIMI_STDERR_LOG=%RUNTIME_DIR%\kimi-stderr.log"

where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js。
    echo 请先安装 Node.js 22 或更高版本：https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 npm，请重新安装 Node.js。
    pause
    exit /b 1
)

for /f %%V in ('node -p "process.versions.node"') do set "NODE_VERSION=%%V"
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>20||(major===20&&minor>=9)?0:1)"
if errorlevel 1 (
    echo [错误] 当前 Node.js 为 %NODE_VERSION%，Next.js 16 需要 20.9 或更高版本。
    pause
    exit /b 1
)

if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"

where kimi >nul 2>&1
if errorlevel 1 goto kimi_unavailable

set "KIMI_PID="
if exist "%KIMI_PID_FILE%" set /p KIMI_PID=<"%KIMI_PID_FILE%"
if defined KIMI_PID (
    powershell.exe -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $env:KIMI_PID) -ErrorAction SilentlyContinue; if ($p -and $p.CommandLine -match 'kimi(\.exe)?\s+web') { exit 0 }; exit 1"
    if not errorlevel 1 goto kimi_ready
    del /q "%KIMI_PID_FILE%" >nul 2>&1
    set "KIMI_PID="
)

powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest -Uri $env:KIMI_HEALTH_URL -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 }; exit 1 } catch { exit 1 }"
if not errorlevel 1 goto kimi_ready

powershell.exe -NoProfile -Command "try { $client = New-Object System.Net.Sockets.TcpClient; $client.Connect('127.0.0.1', [int]$env:KIMI_PORT); $client.Dispose(); exit 0 } catch { if ($client) { $client.Dispose() }; exit 1 }"
if not errorlevel 1 goto kimi_port_busy

echo 正在启动 Kimi Code 本地服务……
del /q "%KIMI_STDOUT_LOG%" "%KIMI_STDERR_LOG%" >nul 2>&1
powershell.exe -NoProfile -Command "$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/c',('kimi web --no-open --port ' + $env:KIMI_PORT) -WorkingDirectory $env:PROJECT_DIR -RedirectStandardOutput $env:KIMI_STDOUT_LOG -RedirectStandardError $env:KIMI_STDERR_LOG -WindowStyle Hidden -PassThru; Set-Content -LiteralPath $env:KIMI_PID_FILE -Value $p.Id -Encoding Ascii"
if errorlevel 1 goto kimi_start_failed
set /p KIMI_PID=<"%KIMI_PID_FILE%"
powershell.exe -NoProfile -Command "$deadline = (Get-Date).AddSeconds(30); while ((Get-Date) -lt $deadline) { if (-not (Get-Process -Id $env:KIMI_PID -ErrorAction SilentlyContinue)) { exit 2 }; try { $response = Invoke-WebRequest -Uri $env:KIMI_HEALTH_URL -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; exit 1"
if errorlevel 1 goto kimi_start_failed
goto kimi_ready

:kimi_unavailable
echo [提示] 未检测到 Kimi Code CLI，排盘仍可启动，AI 问答暂不可用。
goto kimi_done

:kimi_port_busy
echo [提示] 端口 %KIMI_PORT% 被占用且不是可用的 Kimi Code 服务，AI 问答暂不可用。
goto kimi_done

:kimi_start_failed
echo [提示] Kimi Code 本地服务启动失败，排盘仍可启动。
if exist "%KIMI_STDERR_LOG%" type "%KIMI_STDERR_LOG%"
if defined KIMI_PID taskkill /PID "%KIMI_PID%" /T /F >nul 2>&1
del /q "%KIMI_PID_FILE%" >nul 2>&1
goto kimi_done

:kimi_ready
echo Kimi Code 本地服务可用。

:kimi_done

set "SERVER_PID="
if exist "%PID_FILE%" set /p SERVER_PID=<"%PID_FILE%"
if defined SERVER_PID (
    powershell.exe -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $env:SERVER_PID) -ErrorAction SilentlyContinue; if ($p -and $p.CommandLine -match 'npm(\.cmd)?\s+run\s+dev') { exit 0 }; exit 1"
    if not errorlevel 1 (
        echo 紫微斗数已经在运行，正在打开浏览器……
        start "" "%APP_URL%"
        exit /b 0
    )
    del /q "%PID_FILE%" >nul 2>&1
    set "SERVER_PID="
)

powershell.exe -NoProfile -Command "try { $client = New-Object System.Net.Sockets.TcpClient; $client.Connect('127.0.0.1', [int]$env:PORT); $client.Dispose(); exit 0 } catch { if ($client) { $client.Dispose() }; exit 1 }"
if not errorlevel 1 (
    echo [错误] 端口 %PORT% 已被其他程序占用，请先关闭该程序。
    pause
    exit /b 1
)

if not exist "node_modules\next\package.json" (
    echo 首次运行，正在安装项目依赖，请稍候……
    call npm ci --no-audit --no-fund
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络后重试。
        pause
        exit /b 1
    )
)

del /q "%STDOUT_LOG%" "%STDERR_LOG%" >nul 2>&1
powershell.exe -NoProfile -Command "$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/c',('npm run dev -- --port ' + $env:PORT + ' --hostname 127.0.0.1') -WorkingDirectory $env:PROJECT_DIR -RedirectStandardOutput $env:STDOUT_LOG -RedirectStandardError $env:STDERR_LOG -WindowStyle Hidden -PassThru; Set-Content -LiteralPath $env:PID_FILE -Value $p.Id -Encoding Ascii"
if errorlevel 1 (
    echo [错误] 无法启动开发服务器。
    pause
    exit /b 1
)
set /p SERVER_PID=<"%PID_FILE%"

echo 正在启动紫微斗数，等待页面就绪……
powershell.exe -NoProfile -Command "$deadline = (Get-Date).AddSeconds(60); while ((Get-Date) -lt $deadline) { if (-not (Get-Process -Id $env:SERVER_PID -ErrorAction SilentlyContinue)) { exit 2 }; try { $response = Invoke-WebRequest -Uri $env:APP_URL -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -ge 100) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; exit 1"
if errorlevel 1 (
    echo [错误] 页面启动失败或等待超时，日志如下：
    echo ---------- 标准输出 ----------
    if exist "%STDOUT_LOG%" type "%STDOUT_LOG%"
    echo ---------- 错误输出 ----------
    if exist "%STDERR_LOG%" type "%STDERR_LOG%"
    taskkill /PID "%SERVER_PID%" /T /F >nul 2>&1
    del /q "%PID_FILE%" >nul 2>&1
    pause
    exit /b 1
)

start "" "%APP_URL%"
echo.
echo [成功] 紫微斗数已启动：%APP_URL%
echo 关闭服务：双击 stop.bat
echo 运行日志：%RUNTIME_DIR%
exit /b 0
