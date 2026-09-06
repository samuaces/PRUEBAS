import SwiftUI

/// Ficha de una película o serie: sinopsis, temporadas y episodios.
struct Ficha: View {
    @State var contenido: Contenido
    @EnvironmentObject private var biblioteca: Biblioteca
    @State private var temporadaElegida: Int = 1
    @State private var cargandoEpisodios = false
    @State private var reproduciendo: Reproduccion?

    struct Reproduccion: Identifiable {
        let id: String
        let titulo: String
        let subtitulo: String
        let url: String
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                cabecera

                if let sinopsis = contenido.sinopsis, !sinopsis.isEmpty {
                    Text(sinopsis).font(.callout).foregroundStyle(.secondary)
                }

                if contenido.tipo == .serie {
                    episodios
                } else if contenido.fuentes.count > 1 {
                    fuentes
                }
            }
            .padding()
        }
        .navigationTitle(contenido.titulo)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if contenido.episodiosPendientes {
                cargandoEpisodios = true
                contenido = await biblioteca.cargaEpisodios(de: contenido)
                temporadaElegida = contenido.temporadas.first?.numero ?? 1
                cargandoEpisodios = false
            } else {
                temporadaElegida = contenido.temporadas.first?.numero ?? 1
            }
        }
        .fullScreenCover(item: $reproduciendo) { datos in
            Reproductor(titulo: datos.titulo, subtitulo: datos.subtitulo, url: datos.url,
                        identificador: datos.id, caratula: contenido.caratula)
        }
    }

    private var cabecera: some View {
        HStack(alignment: .top, spacing: 14) {
            Caratula(contenido: contenido).frame(width: 120)

            VStack(alignment: .leading, spacing: 8) {
                Text(contenido.categoria).font(.caption).foregroundStyle(.secondary)
                if let anyo = contenido.anyo { Text(String(anyo)).font(.subheadline) }
                if !contenido.generos.isEmpty {
                    Text(contenido.generos.prefix(3).joined(separator: " · "))
                        .font(.caption).foregroundStyle(.secondary)
                }

                Button {
                    reproduceLoPrimero()
                } label: {
                    Label(hayMarcador ? "Continuar" : "Reproducir", systemImage: "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(contenido.primeraUrl == nil)

                Button {
                    biblioteca.alternaFavorito(contenido)
                } label: {
                    Label(biblioteca.esFavorito(contenido) ? "En favoritos" : "Favorito",
                          systemImage: biblioteca.esFavorito(contenido) ? "heart.fill" : "heart")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private var hayMarcador: Bool { biblioteca.marcador(de: contenido.id) != nil }

    @ViewBuilder private var episodios: some View {
        if cargandoEpisodios {
            HStack { ProgressView(); Text("Cargando episodios…").foregroundStyle(.secondary) }
        } else if contenido.temporadas.isEmpty {
            Text("Esta serie no tiene episodios disponibles.").foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 12) {
                if contenido.temporadas.count > 1 {
                    Picker("Temporada", selection: $temporadaElegida) {
                        ForEach(contenido.temporadas) { temporada in
                            Text("T\(temporada.numero)").tag(temporada.numero)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                ForEach(contenido.temporadas.first { $0.numero == temporadaElegida }?.episodios ?? []) { episodio in
                    Button {
                        reproduciendo = Reproduccion(
                            id: "\(contenido.id)-\(episodio.id)",
                            titulo: contenido.titulo,
                            subtitulo: "T\(temporadaElegida) · E\(episodio.numero)",
                            url: episodio.url)
                    } label: {
                        HStack(spacing: 12) {
                            Text("\(episodio.numero)")
                                .font(.callout.monospacedDigit().weight(.semibold))
                                .foregroundStyle(.secondary)
                                .frame(width: 28)
                            Text(episodio.titulo).font(.callout).lineLimit(2)
                            Spacer()
                            Image(systemName: "play.circle").foregroundStyle(.tint)
                        }
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.plain)
                    Divider()
                }
            }
        }
    }

    private var fuentes: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Fuentes").font(.headline)
            ForEach(Array(contenido.fuentes.enumerated()), id: \.offset) { indice, fuente in
                Button {
                    reproduciendo = Reproduccion(id: contenido.id, titulo: contenido.titulo,
                                                 subtitulo: fuente.etiqueta, url: fuente.url)
                } label: {
                    HStack {
                        Text(fuente.etiqueta.isEmpty ? "Fuente \(indice + 1)" : fuente.etiqueta)
                        Spacer()
                        Image(systemName: "play.circle").foregroundStyle(.tint)
                    }
                    .padding(.vertical, 6)
                }
                .buttonStyle(.plain)
                Divider()
            }
        }
    }

    private func reproduceLoPrimero() {
        if contenido.tipo == .serie,
           let temporada = contenido.temporadas.first,
           let episodio = temporada.episodios.first {
            reproduciendo = Reproduccion(id: "\(contenido.id)-\(episodio.id)", titulo: contenido.titulo,
                                         subtitulo: "T\(temporada.numero) · E\(episodio.numero)", url: episodio.url)
        } else if let fuente = contenido.fuentes.first {
            reproduciendo = Reproduccion(id: contenido.id, titulo: contenido.titulo,
                                         subtitulo: fuente.etiqueta, url: fuente.url)
        }
    }
}
