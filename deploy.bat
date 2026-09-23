@echo off
chcp 65001 >nul
cd /d "%~dp0"
git add -A
git commit -m "update %date% %time%"
git push
echo.
echo 올렸습니다. 1~2분 뒤 사이트에 반영됩니다.
pause
