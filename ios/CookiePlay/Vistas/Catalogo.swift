import SwiftUI

/// Rejilla de películas o series, con filtro por categoría y buscador.
struct Catalogo: View {
    let tipo: TipoContenido
    @EnvironmentObject private var biblioteca: Biblioteca
    @State private var categoria: String?
    @State private var consulta = ""
    @State private var seleccion: Contenido?

    private var todos: [Contenido] { tipo == .pelicula ? biblioteca.peliculas : biblioteca.series }

    private var categorias: [String] {
        Array(Set(todos.map(\.categoria))).sorted()
    }

    private var mostrados: [Contenido] {
        var lista = todos
        if let categoria { lista = lista.filter { $0.categoria == categoria } }
        let termino = Texto.plano(consulta).trimmingCharacters(in: .whitespaces)
        if !termino.isEmpty { lista = lista.filter { Texto.plano($0.titulo).contains(termino) } }
        return lista
    }

    var body: some View {
        ScrollView {
            if !categorias.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        chip(titulo: "Todo", activo: categoria == nil) { categoria = nil }
                        ForEach(categorias, id: \.self) { nombre in
                            chip(titulo: nombre, activo: categoria == nombre) { categoria = nombre }
                        }
                    }
                    .padding(.horizontal)
                }
                .padding(.vertical, 8)
            }

            if mostrados.isEmpty {
                Vacio(simbolo: "magnifyingglass", titulo: "Nada por aquí",
                      detalle: "Prueba con otra categoría o cambia la búsqueda.")
            } else {
                RejillaContenido(contenidos: mostrados) { seleccion = $0 }
            }
        }
        .searchable(text: $consulta, prompt: tipo == .pelicula ? "Buscar películas" : "Buscar series")
        .navigationTitle(tipo == .pelicula ? "Películas" : "Series")
        .navigationDestination(item: $seleccion) { contenido in Ficha(contenido: contenido) }
    }

    private func chip(titulo: String, activo: Bool, accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            Text(titulo)
                .font(.footnote.weight(.medium))
                .padding(.horizontal, 13).padding(.vertical, 7)
                .background(activo ? Color.accentColor : Color.secondary.opacity(0.18), in: Capsule())
                .foregroundStyle(activo ? .white : .primary)
        }
        .buttonStyle(.plain)
    }
}
