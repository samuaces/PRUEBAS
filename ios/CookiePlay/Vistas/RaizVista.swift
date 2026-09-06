import SwiftUI

struct RaizVista: View {
    @EnvironmentObject private var biblioteca: Biblioteca

    var body: some View {
        if biblioteca.listas.isEmpty {
            AltaLista()
        } else {
            TabView {
                NavigationStack { Inicio() }
                    .tabItem { Label("Inicio", systemImage: "house.fill") }

                NavigationStack { Catalogo(tipo: .pelicula) }
                    .tabItem { Label("Películas", systemImage: "film") }

                NavigationStack { Catalogo(tipo: .serie) }
                    .tabItem { Label("Series", systemImage: "rectangle.stack") }

                NavigationStack { Canales() }
                    .tabItem { Label("TV", systemImage: "tv") }

                NavigationStack { Ajustes() }
                    .tabItem { Label("Ajustes", systemImage: "gearshape") }
            }
        }
    }
}
