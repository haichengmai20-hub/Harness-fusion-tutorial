@echo off
cd /d "%~dp0"
python -B study.py open
if errorlevel 1 pause
