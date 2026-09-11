# Botón «Horario» en los accesos rápidos

El botón dentro de los Ajustes rápidos (Android) y del Centro de control (iPhone) solo lo puede
ofrecer una app instalada de verdad, no una web. Esta carpeta tiene el código de ese botón, con el
mismo icono de la app en monocromo, listo para una app envoltorio que cargue la web de Horario.

## Cómo se monta (Capacitor)

1. Publica la web en una dirección `https`.
2. En la carpeta del proyecto:

   ```bash
   npm install @capacitor/core @capacitor/cli
   npx cap init Horario com.horario.app --web-dir .
   npx cap add android
   npx cap add ios
   ```

3. **Android**: copia `android/HorarioTileService.kt` junto a `MainActivity`, el icono
   `android/res/drawable/ic_horario_tile.xml` a `res/drawable/`, y pega
   `android/AndroidManifest.snippet.xml` dentro de `<application>`. Al instalar la app, el botón
   aparece en el editor de Ajustes rápidos para arrastrarlo junto al Wi‑Fi.
4. **iPhone**: añade una extensión *Widget Extension* en Xcode, copia `ios/HorarioControl.swift`
   e importa `../icons/tile.svg` al catálogo de recursos como símbolo «HorarioTile» (Render as:
   Template Image). En iOS 18 se añade desde el Centro de control → «Añadir control» → Horario.

Sin app nativa, en iPhone se puede añadir igualmente un atajo que abra Horario como control
«Atajo» del Centro de control; en Android, el icono de la pantalla de inicio.
