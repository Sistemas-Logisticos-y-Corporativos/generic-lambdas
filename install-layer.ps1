# Script para instalar las dependencias del layer
Write-Host "Instalando dependencias del layer..." -ForegroundColor Green

# Navegar a la carpeta de dependencias
Set-Location -Path "$PSScriptRoot\dependencies\nodejs"

# Instalar solo las dependencias de producción
npm install

Write-Host "Dependencias instaladas correctamente en dependencies/nodejs/" -ForegroundColor Green
Write-Host "Ahora puedes hacer el build y deploy con SAM" -ForegroundColor Yellow

cd ..
cd ..
