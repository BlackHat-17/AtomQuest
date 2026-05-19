@echo off
REM GoalTrack Deployment Script for Windows
REM This script helps deploy the application to Render and Vercel

echo 🚀 GoalTrack Deployment Script
echo ================================

REM Check if required tools are installed
echo 📋 Checking dependencies...

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Git is required but not installed.
    exit /b 1
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is required but not installed.
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ npm is required but not installed.
    exit /b 1
)

echo ✅ All dependencies are installed.

REM Build and test locally
echo 🔨 Building and testing locally...

REM Backend
echo Building backend...
cd backend
call npm ci
call npm run build
call npm run type-check
cd ..

REM Frontend
echo Building frontend...
cd frontend
call npm ci
call npm run build
cd ..

echo ✅ Local build successful.

REM Deploy to platforms
echo 🚀 Starting deployment...

REM Commit and push changes
echo 📤 Pushing to GitHub...
git add .
git commit -m "Deploy: %date% %time%" || echo No changes to commit
git push origin main

echo ✅ Code pushed to GitHub.
echo.
echo 📋 Next steps:
echo 1. Go to Render Dashboard: https://dashboard.render.com
echo 2. Create a new Blueprint and connect your GitHub repo
echo 3. Go to Vercel Dashboard: https://vercel.com/dashboard
echo 4. Import your GitHub repository
echo 5. Configure environment variables as described in deploy.md
echo.
echo 🔗 Useful links:
echo    - Deployment Guide: ./deploy.md
echo    - Render Dashboard: https://dashboard.render.com
echo    - Vercel Dashboard: https://vercel.com/dashboard
echo.
echo 🎉 Deployment preparation complete!
echo Follow the instructions above to complete the deployment.

pause