@echo off
setlocal
cd /d "%~dp0"
title Keyword Analyzer - tests
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
echo  자동 테스트를 실행해요 (실제 설정·데이터는 건드리지 않아요)
set "NODE_OPTIONS="
"%NODE_EXE%" tests\run.mjs
echo.
if errorlevel 1 (echo  실패한 테스트가 있어요. 위 내용을 확인해 주세요.) else (echo  모두 통과했어요.)
pause
exit /b

:nonode
chcp 65001 >nul
echo  Node.js를 찾지 못했어요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
pause