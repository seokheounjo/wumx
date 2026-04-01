@echo off
echo [wumx] Building wumx for Windows...

echo [wumx] Step 1/4: Building main process...
call npx webpack --config webpack.main.config.js --mode production
if %errorlevel% neq 0 (echo [ERROR] Main build failed & exit /b 1)

echo [wumx] Step 2/4: Building renderer...
call npx webpack --config webpack.renderer.config.js --mode production
if %errorlevel% neq 0 (echo [ERROR] Renderer build failed & exit /b 1)

echo [wumx] Step 3/4: Building CLI...
call npx webpack --config webpack.cli.config.js --mode production
if %errorlevel% neq 0 (echo [ERROR] CLI build failed & exit /b 1)

echo [wumx] Step 4/4: Packaging with electron-builder...
call npx electron-builder --win
if %errorlevel% neq 0 (echo [ERROR] Packaging failed & exit /b 1)

echo [wumx] Build complete! Output in ./release/
