import AppIntents
import SwiftUI
import WidgetKit

/// Control «Horario» para el Centro de control (iOS 18 o superior).
///
/// Va en una extensión de widget de la app envoltorio. El icono es el símbolo
/// «HorarioTile» del catálogo de recursos (icons/tile.svg importado como plantilla).
struct HorarioControl: ControlWidget {
    static let kind = "com.horario.app.control"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenHorarioIntent()) {
                Label("Horario", image: "HorarioTile")
            }
        }
        .displayName("Horario")
        .description("Abre tu horario.")
    }
}

struct OpenHorarioIntent: AppIntent {
    static let title: LocalizedStringResource = "Abrir Horario"
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        .result()
    }
}
