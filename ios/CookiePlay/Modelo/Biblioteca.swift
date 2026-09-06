import Foundation
import SwiftUI

/// Estado de la app: listas guardadas, favoritos y lo que se está viendo.
/// Todo vive en el teléfono, en archivos JSON dentro de Documentos.
@MainActor
final class Biblioteca: ObservableObject {

    @Published var listas: [Lista] = []
    @Published var listaActiva: UUID?
    @Published var favoritos: Set<String> = []
    @Published var marcadores: [Marcador] = []
    @Published var cargando: Bool = false
    @Published var paso: String = ""
    @Published var ultimoError: String?

    private let carpeta: URL

    init() {
        carpeta = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        cargaDeDisco()
    }

    // MARK: - Lo que hay ahora mismo

    var lista: Lista? {
        guard let listaActiva else { return listas.first }
        return listas.first { $0.id == listaActiva } ?? listas.first
    }

    var canales: [Contenido] { lista?.canales ?? [] }
    var peliculas: [Contenido] { lista?.peliculas ?? [] }
    var series: [Contenido] { lista?.series ?? [] }
    var hayContenido: Bool { (lista?.total ?? 0) > 0 }

    // MARK: - Persistencia

    private var archivoListas: URL { carpeta.appendingPathComponent("listas.json") }
    private var archivoAjustes: URL { carpeta.appendingPathComponent("ajustes.json") }

    private struct Ajustes: Codable {
        var listaActiva: UUID?
        var favoritos: [String]
        var marcadores: [Marcador]
    }

    private func cargaDeDisco() {
        if let datos = try? Data(contentsOf: archivoListas),
           let guardadas = try? JSONDecoder().decode([Lista].self, from: datos) {
            listas = guardadas
        }
        if let datos = try? Data(contentsOf: archivoAjustes),
           let ajustes = try? JSONDecoder().decode(Ajustes.self, from: datos) {
            listaActiva = ajustes.listaActiva
            favoritos = Set(ajustes.favoritos)
            marcadores = ajustes.marcadores
        }
    }

    func guarda() {
        let listasParaGuardar = listas
        let ajustes = Ajustes(listaActiva: listaActiva, favoritos: Array(favoritos), marcadores: marcadores)
        let destinoListas = archivoListas
        let destinoAjustes = archivoAjustes
        // Escribir un catálogo grande no debe congelar la interfaz.
        Task.detached(priority: .utility) {
            if let datos = try? JSONEncoder().encode(listasParaGuardar) {
                try? datos.write(to: destinoListas, options: .atomic)
            }
            if let datos = try? JSONEncoder().encode(ajustes) {
                try? datos.write(to: destinoAjustes, options: .atomic)
            }
        }
    }

    // MARK: - Añadir listas

    func anyadeXtream(nombre: String, servidor: String, usuario: String, clave: String) async {
        let cuenta = CuentaXtream(servidor: servidor, usuario: usuario, clave: clave)
        await conProgreso {
            let catalogo = try await ClienteXtream.catalogo(cuenta) { [weak self] texto in
                Task { @MainActor in self?.paso = texto }
            }
            let titulo = nombre.isEmpty ? (URL(string: ClienteXtream.base(servidor))?.host ?? "Mi lista") : nombre
            var lista = Lista(nombre: self.nombreLibre(titulo), clase: .xtream,
                              servidor: ClienteXtream.base(servidor), usuario: usuario, clave: clave)
            lista.canales = catalogo.canales
            lista.peliculas = catalogo.peliculas
            lista.series = catalogo.series
            self.guardaLista(lista)
        }
    }

    func anyadeM3U(nombre: String, direccion: String) async {
        await conProgreso {
            self.paso = "Descargando la lista…"
            let texto = try await ClienteRed.texto(direccion)
            guard texto.contains("#EXT") else {
                throw ClienteRed.Fallo.formato("Eso no parece una lista M3U")
            }
            self.paso = "Ordenando el contenido…"
            let catalogo = ParserM3U.catalogo(texto)
            let titulo = nombre.isEmpty ? (URL(string: direccion)?.host ?? "Mi lista") : nombre
            var lista = Lista(nombre: self.nombreLibre(titulo), clase: .m3u, url: direccion)
            lista.canales = catalogo.canales
            lista.peliculas = catalogo.peliculas
            lista.series = catalogo.series
            self.guardaLista(lista)
        }
    }

    /// Detecta sola si la dirección es de un panel Xtream o una lista suelta.
    func anyadeDesdeEnlace(nombre: String, direccion: String) async {
        if let componentes = URLComponents(string: direccion),
           let usuario = componentes.queryItems?.first(where: { $0.name == "username" })?.value,
           let clave = componentes.queryItems?.first(where: { $0.name == "password" })?.value,
           let host = componentes.host {
            let esquema = componentes.scheme ?? "http"
            let puerto = componentes.port.map { ":\($0)" } ?? ""
            await anyadeXtream(nombre: nombre, servidor: "\(esquema)://\(host)\(puerto)", usuario: usuario, clave: clave)
            if ultimoError == nil { return }
            // Si el panel no atiende su API, la lista suelta suele seguir sirviendo.
            ultimoError = nil
            await anyadeM3U(nombre: nombre, direccion: direccion)
        } else {
            await anyadeM3U(nombre: nombre, direccion: direccion)
        }
    }

    func actualiza(_ lista: Lista) async {
        if let cuenta = lista.cuenta {
            await anyadeXtream(nombre: lista.nombre, servidor: cuenta.servidor, usuario: cuenta.usuario, clave: cuenta.clave)
        } else if let url = lista.url {
            await anyadeM3U(nombre: lista.nombre, direccion: url)
        }
    }

    private func conProgreso(_ trabajo: @escaping () async throws -> Void) async {
        cargando = true
        ultimoError = nil
        defer { cargando = false; paso = "" }
        do {
            try await trabajo()
        } catch {
            ultimoError = error.localizedDescription
        }
    }

    private func nombreLibre(_ base: String) -> String {
        var candidato = base
        var indice = 2
        while listas.contains(where: { $0.nombre == candidato }) {
            candidato = "\(base) (\(indice))"
            indice += 1
        }
        return candidato
    }

    private func guardaLista(_ nueva: Lista) {
        // La misma dirección se actualiza en su sitio en vez de duplicarse.
        if let indice = listas.firstIndex(where: { $0.url != nil && $0.url == nueva.url && nueva.url != nil })
            ?? listas.firstIndex(where: { $0.servidor != nil && $0.servidor == nueva.servidor && $0.usuario == nueva.usuario }) {
            var actualizada = nueva
            actualizada.id = listas[indice].id
            actualizada.nombre = listas[indice].nombre
            listas[indice] = actualizada
            listaActiva = actualizada.id
        } else {
            listas.append(nueva)
            listaActiva = nueva.id
        }
        guarda()
    }

    func elige(_ id: UUID) {
        listaActiva = id
        guarda()
    }

    func borra(_ id: UUID) {
        listas.removeAll { $0.id == id }
        if listaActiva == id { listaActiva = listas.first?.id }
        guarda()
    }

    // MARK: - Episodios bajo demanda

    func cargaEpisodios(de contenido: Contenido) async -> Contenido {
        guard contenido.episodiosPendientes,
              let idSerie = contenido.idSerie,
              let lista, let cuenta = lista.cuenta else { return contenido }
        do {
            let temporadas = try await ClienteXtream.temporadas(cuenta, idSerie: idSerie)
            var copia = contenido
            copia.temporadas = temporadas
            copia.episodiosPendientes = false
            if let indiceLista = listas.firstIndex(where: { $0.id == lista.id }),
               let indiceSerie = listas[indiceLista].series.firstIndex(where: { $0.id == contenido.id }) {
                listas[indiceLista].series[indiceSerie] = copia
                guarda()
            }
            return copia
        } catch {
            ultimoError = error.localizedDescription
            return contenido
        }
    }

    // MARK: - Favoritos y continuar viendo

    func esFavorito(_ contenido: Contenido) -> Bool { favoritos.contains(contenido.id) }

    func alternaFavorito(_ contenido: Contenido) {
        if favoritos.contains(contenido.id) { favoritos.remove(contenido.id) }
        else { favoritos.insert(contenido.id) }
        guarda()
    }

    var favoritosContenido: [Contenido] {
        let todo = canales + peliculas + series
        return todo.filter { favoritos.contains($0.id) }
    }

    func apunta(_ marcador: Marcador) {
        marcadores.removeAll { $0.id == marcador.id }
        marcadores.insert(marcador, at: 0)
        if marcadores.count > 60 { marcadores.removeLast(marcadores.count - 60) }
        guarda()
    }

    func marcador(de id: String) -> Marcador? { marcadores.first { $0.id == id } }

    var continuarViendo: [Contenido] {
        let todo = peliculas + series
        return marcadores.compactMap { marcador in
            todo.first { $0.id == marcador.id || marcador.id.hasPrefix($0.id) }
        }.reduce(into: [Contenido]()) { salida, contenido in
            if !salida.contains(where: { $0.id == contenido.id }) { salida.append(contenido) }
        }
    }

    // MARK: - Búsqueda y recomendaciones

    func busca(_ consulta: String) -> [Contenido] {
        let termino = Texto.plano(consulta).trimmingCharacters(in: .whitespaces)
        guard termino.count >= 2 else { return [] }
        let todo = series + peliculas + canales
        return todo.filter { contenido in
            Texto.plano(contenido.titulo).contains(termino) || Texto.plano(contenido.categoria).contains(termino)
        }
    }

    /// Recomendados: la valoración manda, y sube lo que se parece a tus favoritos.
    var recomendados: [Contenido] {
        let guardados = favoritosContenido
        var afinidad: [String: Double] = [:]
        for favorito in guardados {
            afinidad[favorito.categoria, default: 0] += 2
            for genero in favorito.generos { afinidad[genero, default: 0] += 2 }
        }
        let candidatos = (peliculas + series).filter { !favoritos.contains($0.id) }
        return candidatos.map { contenido -> (Contenido, Double) in
            var punto = (contenido.nota ?? 0) * 10
            if contenido.nota == nil { punto = 30 }
            punto += min(afinidad[contenido.categoria] ?? 0, 10) * 4
            for genero in contenido.generos { punto += min(afinidad[genero] ?? 0, 8) * 2 }
            if let anyo = contenido.anyo, anyo >= Calendar.current.component(.year, from: .now) - 2 { punto += 8 }
            if contenido.caratula != nil { punto += 5 }
            return (contenido, punto)
        }
        .sorted { $0.1 > $1.1 }
        .prefix(40)
        .map(\.0)
    }

    func porCategoria(_ contenidos: [Contenido]) -> [(String, [Contenido])] {
        Dictionary(grouping: contenidos, by: \.categoria)
            .map { ($0.key, $0.value) }
            .sorted { $0.1.count > $1.1.count }
    }
}
