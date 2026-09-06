import SwiftUI

@main
struct CookiePlayApp: App {
    @StateObject private var biblioteca = Biblioteca()

    var body: some Scene {
        WindowGroup {
            RaizVista()
                .environmentObject(biblioteca)
                .tint(.accentColor)
                .preferredColorScheme(.dark)
        }
    }
}
