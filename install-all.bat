@echo off
chcp 65001 >nul
title PodFlow Ultimate Installer (Fixed)

echo ========================================================
echo        PodFlow Installer (Universal Swap Strategy)
echo ========================================================
echo.

:: 1. Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please check PATH.
    pause
    exit /b
)

:: 2. Setup Backend Virtual Environment
echo [1/5] Preparing Backend Virtual Environment...
cd backend
if not exist venv (
    echo     - Creating venv...
    python -m venv venv
)
call venv\Scripts\activate

:: 3. Hardware Selection
echo.
echo ========================================================
echo [2/5] Hardware Selection
echo ========================================================
echo.
echo  [1] Standard GPU (RTX 30/40 Series)
echo      - Strategy: Install WhisperX then Swap to Torch 2.8.1 (CUDA 12.4)
echo.
echo  [2] RTX 50 Series (RTX 5070)
echo      - Strategy: Install WhisperX then Swap to Torch 2.9.1 (CUDA 13.0)
echo.
set /p gpu_choice="Select Option (1 or 2): "

:: 无论选哪个，第一步都是一样的
echo.
echo [INFO] Step A: Installing Full WhisperX (Downloading dependencies)...
echo     (This will install a CPU Torch first, which we will replace later)
pip install whisperx

if "%gpu_choice%"=="2" goto install_rtx50
if "%gpu_choice%"=="1" goto install_std
goto install_std

:install_std
echo.
echo [INFO] Step B: Swapping Engine for Standard GPU...
:: 1. Uninstall CPU Torch
pip uninstall torch torchvision torchaudio -y
:: 2. Install Stable GPU Torch (2.8.1 + CUDA 12.4)
echo     - Installing GPU Torch (CUDA 12.4)...
pip install torch==2.8.1 torchaudio==2.8.1 torchvision==0.19.1 --index-url https://download.pytorch.org/whl/cu124
goto install_common

:install_rtx50
echo.
echo [INFO] Step B: Swapping Engine for RTX 50 Series...
:: 1. Uninstall CPU Torch
pip uninstall torch torchvision torchaudio -y
:: 2. Install Bleeding Edge GPU Torch (2.9.1 + CUDA 13.0)
echo     - Installing GPU Torch (CUDA 13.0)...
pip install torch==2.9.1+cu130 torchaudio==2.9.1+cu130 torchvision==0.24.1+cu130 --index-url https://download.pytorch.org/whl/cu130
goto install_common

:install_common
:: 4. Install other app dependencies
echo.
echo [3/5] Installing Application Dependencies...
:: IMPORTANT: requirements.txt must NOT contain torch/whisperx
pip install -r requirements.txt

:: 5. Validation
echo.
echo [4/5] Final Environment Check...
pip list | findstr "torch"
pip list | findstr "whisperx"

:: 6. Generate .env
if not exist .env (
    copy .env.example .env >nul
)

:: 7. Setup Frontend
echo.
echo [5/5] Setting up Frontend...
cd ..\frontend
call npm install

echo.
echo ========================================================
echo        Setup Completed!
echo ========================================================
echo.
pause