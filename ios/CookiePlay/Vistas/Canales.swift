import SwiftUI

struct Canales: View {
    @EnvironmentObject private var biblioteca: Biblioteca
    @State private var categoria: String?
    @State private var consulta = ""
    @State private var enMarcha: Contenido?

    private var categorias: [String] { Array(Set(biblioteca.canales.map(\.categoria))).sorted() }

    private var mostrados: [Contenido] {
        var lista = biblioteca.canales
        if let categoria { lista = lista.filter { $0.categoria == categoria } }
        let termino = Texto.plano(consulta).trimmingCharacters(in: .whitespaces)
        if !termino.isEmpty { lista = lista.filter { Texto.plano($0.titulo).contains(termino) } }
        return lista
    }

    var body: some View {
        List {
            if !categorias.isEmpty {
                Section {
                    Picker("Categoría", selection: $categoria) {
                        Text("Todas").tag(String?.none)
                        ForEach(categorias, id: \.self) { nombre in
                            Text(nombre).tag(String?.some(nombre))
                        }
                    }
                }
            }

            Section("\(mostrados.count) canales") {
                ForEach(mostrados) { canal in
                    Button { enMarcha = canal } label: { FilaCanal(contenido: canal) }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .leading) {
                            Button {
                                biblioteca.alternaFavorito(canal)
                            } label: {
                                Label("Favorito", systemImage: biblioteca.esFavorito(canal) ? "heart.slash" : "heart")
                            }
                            .tint(.pink)
                        }
                }
            }
        }
        .listStyle(.plain)
        .searchable(text: $consulta, prompt: "Buscar canal")
        .navigationTitle("TV en directo")
        .fullScreenCover(item: $enMarcha) { canal in
            Reproductor(titulo: canal.titulo, subtitulo: canal.categoria,
                        url: canal.fuentes.first?.url ?? "", identificador: canal.id, caratula: canal.caratula)
        }
    }
}
