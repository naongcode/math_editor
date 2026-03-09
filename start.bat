@echo off
start "FastAPI Server" cmd /k "python server.py"
timeout /t 2 >nul
start "Vite Dev" cmd /k "npm run dev"
