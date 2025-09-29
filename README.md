# Proyecto: Árbol de Logros de Minecraft

## Descripción

Este proyecto es una réplica del Árbol de Logros de Minecraft. La aplicación fue desarrollada en React y gestiona el estado de los logros utilizando Redux. El árbol de logros se descarga dinámicamente desde un archivo JSON proporcionado.

## Ejecución

1. **Instalar dependencias**:
   Una vez que tengas el proyecto descargado y descomprimido, navega al directorio del proyecto e instala las dependencias ejecutando:
    ```bash
    npm install
    ```
2. **Iniciar el servidor de desarrollo**:
   Para ejecutar el proyecto localmente, usa el siguiente comando:
    ```bash
    npm start
    ```
3. **Acceder a la aplicación**:
   Una vez que el servidor esté en funcionamiento, abre tu navegador y ve a `http://localhost:3000` para ver la aplicación en acción.

## Configuración de la URL del Árbol de Logros
Por defecto, la aplicación carga los logros desde:

```bash
    https://minecraft.capta.co/BaseSkillTree.json
```

Si deseas cambiar la URL de donde se descargan los logros, debes crear o editar un archivo .env en la raíz del proyecto y añadir la siguiente variable:

```bash
    VITE_SKILLTREE_URL=https://tuservidor.com/mis-logros.json
```