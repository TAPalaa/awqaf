@echo off
echo ========================================================
echo   Building Awqaf Desktop App (Awqaf.exe)
echo ========================================================
cd /d "%~dp0.."
python -m PyInstaller --noconfirm --clean --noconsole --onefile --name "Awqaf" --add-data "www;www" desktop/app.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed! Check the messages above.
    pause
    exit /b 1
)
echo.
echo [SUCCESS] Done! File location: dist\Awqaf.exe
pause