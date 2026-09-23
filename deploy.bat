@echo off
chcp 65001 >nul
cd /d "%~dp0"
git add -A
git commit -m "update %date% %time%"
git push
if errorlevel 1 (
  echo.
  echo 푸시에 실패했습니다. 처음이라면 README 의 "처음 한 번만" 을 먼저 하세요.
) else (
  echo.
  echo 올렸습니다. 1~2분 뒤 사이트에 반영됩니다.
)
pause
