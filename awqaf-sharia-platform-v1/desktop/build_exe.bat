@echo off
chcp 65001 >nul
echo ========================================================
echo   بناء تطبيق الحاسوب (Awqaf.exe) - وزارة الأوقاف
echo ========================================================
cd /d "%~dp0.."
python -m PyInstaller --noconfirm --clean --noconsole --onefile --name "Awqaf" --add-data "www;www" desktop/app.py
echo.
echo تم البناء! ستجد الملف التنفيذي داخل مجلد dist\Awqaf.exe
pause
