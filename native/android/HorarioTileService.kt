package com.horario.app

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * Botón «Horario» en los Ajustes rápidos (la bandeja del Wi‑Fi).
 *
 * Al pulsarlo se abre la app. El subtítulo puede mostrar el servicio del día si la
 * app lo guarda en SharedPreferences ("horario", clave "today") cada vez que arranca.
 */
class HorarioTileService : TileService() {

    override fun onStartListening() {
        val tile = qsTile ?: return
        tile.state = Tile.STATE_ACTIVE
        tile.label = "Horario"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val today = getSharedPreferences("horario", MODE_PRIVATE).getString("today", null)
            tile.subtitle = today ?: "Abrir"
        }
        tile.updateTile()
    }

    override fun onClick() {
        val intent = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val pending = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            startActivityAndCollapse(pending)
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}
