# Dependency Layer - README

## Estructura del Layer

```
dependencies/
└── nodejs/
    ├── package.json
    └── node_modules/  (generado después de instalar)
```

## Instalación de Dependencias

Ejecuta el script de instalación:

```powershell
.\install-layer.ps1
```

O manualmente:

```powershell
cd dependencies\nodejs
npm install --production
```

## Build y Deploy

Para hacer build del proyecto incluyendo el layer:

```powershell
sam build
```

Para hacer deploy:

```powershell
sam deploy --config-env dev
```

## Notas Importantes

- El layer contiene únicamente las dependencias de producción (node_modules y package.json)
- Compatible con Node.js 20.x y arquitectura ARM64
- Las dependencias están disponibles en `/opt/nodejs/node_modules` dentro de Lambda
- Cada vez que actualices las dependencias, debes volver a instalarlas en el layer y hacer redeploy
