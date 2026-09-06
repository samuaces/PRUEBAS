import SwiftUI

struct Inicio: View {
    @EnvironmentObject private var biblioteca: Biblioteca
    @State private var seleccion: Contenido?
    @State private var canalEnMarcha: Contenido?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                if biblioteca.listas.count > 1 { selectorListas }

                Carrusel(titulo: "Continuar viendo", contenidos: biblioteca.continuarViendo) { seleccion = $0 }
                Carrusel(titulo: "Recomendado para ti", contenidos: Array(biblioteca.recomendados.prefix(20))) { seleccion = $0 }
                Carrusel(titulo: "Películas", contenidos: Array(biblioteca.peliculas.prefix(20))) { seleccion = $0 }
                Carrusel(titulo: "Series", contenidos: Array(biblioteca.series.prefix(20))) { seleccion = $0 }

                if !biblioteca.favoritosContenido.isEmpty {
                    Carrusel(titulo: "Favoritos", contenidos: biblioteca.favoritosContenido) { contenido in
                        if contenido.tipo == .canal { canalEnMarcha = contenido } else { seleccion = contenido }
                    }
                }

                if !biblioteca.hayContenido {
                    Vacio(simbolo: "tray", titulo: "Lista vacía",
                          detalle: "No se ha encontrado contenido en esta lista. Prueba a actualizarla en Ajustes.")
                }
            }
            .padding()
        }
        .navigationTitle(biblioteca.lista?.nombre ?? "Cookie Play")
        .navigationDestination(item: $seleccion) { contenido in
            Ficha(contenido: contenido)
        }
        .fullScreenCover(item: $canalEnMarcha) { canal in
            Reproductor(titulo: canal.titulo, subtitulo: canal.categoria,
                        url: canal.fuentes.first?.url ?? "", identificador: canal.id, caratula: canal.caratula)
        }
    }

    private var selectorListas: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(biblioteca.listas) { lista in
                    Button {
                        biblioteca.elige(lista.id)
                    } label: {
                        Text(lista.nombre)
                            .font(.footnote.weight(.medium))
                            .padding(.horizontal, 14).padding(.vertical, 7)
                            .background(lista.id == biblioteca.lista?.id ? Color.accentColor : Color.secondary.opacity(0.18),
                                        in: Capsule())
                            .foregroundStyle(lista.id == biblioteca.lista?.id ? .white : .primary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
