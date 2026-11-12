@echo off
setlocal
cd /d "%~dp0"
title Keyword Analyzer (localhost:8787)
set "NODE_EXE="

rem 1) PATH
for /f "delims=" %%i in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%i"
if defined NODE_EXE goto run

rem 2) fnm (default version)
where fnm >nul 2>nul
if errorlevel 1 goto scan
for /f "delims=" %%i in ('fnm exec --using=default where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%i"
if defined NODE_EXE goto run

:scan
rem 3) common install folders
for /d %%d in ("%APPDATA%\fnm\node-versions\*") do if exist "%%d\installation\node.exe" set "NODE_EXE=%%d\installation\node.exe"
if defined NODE_EXE goto run
for /d %%d in ("%LOCALAPPDATA%\fnm\node-versions\*") do if exist "%%d\installation\node.exe" set "NODE_EXE=%%d\installation\node.exe"
if defined NODE_EXE goto run
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if defined NODE_EXE goto run
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if defined NODE_EXE goto run
if defined NVM_SYMLINK if exist "%NVM_SYMLINK%\node.exe" set "NODE_EXE=%NVM_SYMLINK%\node.exe"
if defined NODE_EXE goto run
if exist "%LOCALAPPDATA%\Volta\bin\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Volta\bin\node.exe"
if defined NODE_EXE goto run
rem 4) Aside bundled node (fallback)
if exist "%USERPROFILE%\.aside\runtime\node\node.exe" set "NODE_EXE=%USERPROFILE%\.aside\runtime\node\node.exe"
if defined NODE_EXE goto run
goto nonode

:run
chcp 65001 >nul
echo  Node: "%NODE_EXE%"
set "NODE_OPTIONS="
rem 화면의 [서버 다시 시작] 버튼: 서버가 코드 99로 끝나면 다시 실행 (브라우저는 처음 한 번만 열기)
set "KT_LOOP=1"
set "OPENFLAG=--open"
:again
"%NODE_EXE%" server.mjs %OPENFLAG%
if "%errorlevel%"=="99" (
  set "OPENFLAG="
  echo.
  echo  서버를 다시 시작해요...
  goto again
)
pause
exit /b

:nonode
chcp 65001 >nul
echo.
echo  Node.js를 찾지 못했어요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
echo.
pause