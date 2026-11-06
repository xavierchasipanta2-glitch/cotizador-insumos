# Cotizador de insumos (PWA)

App web instalable para comparar precios de insumos entre varios locales.
Funciona sin internet y guarda todo en el teléfono.

## Archivos (todos van en la raíz del repositorio)

```
index.html
styles.css
app.js
manifest.json
service-worker.js
icons/icon-192.png
icons/icon-512.png
icons/icon-maskable-512.png
```

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `cotizador-insumos`).
2. Sube todos estos archivos a la raíz del repositorio (respetando la carpeta `icons/`).
3. En el repositorio: **Settings → Pages → Build and deployment**.
   - Source: **Deploy from a branch**
   - Branch: **main** y carpeta **/ (root)** → Save.
4. Espera 1–2 minutos. La app quedará en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

## Instalar en el celular

Abre la dirección en Chrome (Android) → menú ⋮ → **Instalar aplicación** / **Agregar a la pantalla de inicio**.
En iPhone: Safari → Compartir → **Agregar a pantalla de inicio**.

## Actualizar la app

Cuando cambies archivos, sube también el cambio de número en `service-worker.js` (`VERSION`) y en `app.js` (`APP_VERSION`)
para que los teléfonos descarguen la versión nueva (se ve al abrir la app dos veces).
