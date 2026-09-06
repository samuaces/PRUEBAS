import Foundation

/// Los paneles Xtream devuelven los números unas veces como texto y otras como
/// número. Este envoltorio acepta ambas cosas sin romperse.
struct ValorLibre: Codable, Hashable {
    let texto: String?

    init(from decoder: Decoder) throws {
        let contenedor = try decoder.singleValueContainer()
        if let valor = try? contenedor.decode(String.self) { texto = valor }
        else if let valor = try? contenedor.decode(Int.self) { texto = String(valor) }
        else if let valor = try? contenedor.decode(Double.self) { texto = String(valor) }
        else if let valor = try? contenedor.decode(Bool.self) { texto = valor ? "1" : "0" }
        else { texto = nil }
    }

    func encode(to encoder: Encoder) throws {
        var contenedor = encoder.singleValueContainer()
        try contenedor.encode(texto)
    }

    var entero: Int? { texto.flatMap { Int($0) } ?? texto.flatMap { Double($0).map(Int.init) } }
    var decimal: Double? { texto.flatMap { Double($0) } }
}

/// Cliente del panel: es la misma API que usan MaxPlayer y compañía.
enum ClienteXtream {

    struct Categoria: Codable { let category_id: ValorLibre?; let category_name: String? }

    struct CanalRemoto: Codable {
        let stream_id: ValorLibre?
        let name: String?
        let stream_icon: String?
        let category_id: ValorLibre?
        let epg_channel_id: String?
    }

    struct PeliculaRemota: Codable {
        let stream_id: ValorLibre?
        let name: String?
        let title: String?
        let stream_icon: String?
        let cover: String?
        let rating: ValorLibre?
        let year: ValorLibre?
        let releaseDate: String?
        let genre: String?
        let plot: String?
        let container_extension: String?
        let category_id: ValorLibre?
    }

    struct SerieRemota: Codable {
        let series_id: ValorLibre?
        let name: String?
        let cover: String?
        let rating: ValorLibre?
        let releaseDate: String?
        let genre: String?
        let plot: String?
        let category_id: ValorLibre?
    }

    struct EpisodioRemoto: Codable {
        let id: ValorLibre?
        let episode_num: ValorLibre?
        let title: String?
        let container_extension: String?
        let info: InfoEpisodio?

        struct InfoEpisodio: Codable { let movie_image: String? }
    }

    struct RespuestaSerie: Codable { let episodes: [String: [EpisodioRemoto]]? }

    struct InfoCuenta: Codable {
        struct Usuario: Codable {
            let auth: ValorLibre?
            let status: String?
            let exp_date: ValorLibre?
        }
        let user_info: Usuario?
    }

    // MARK: - Direcciones

    static func base(_ servidor: String) -> String {
        var limpio = servidor.trimmingCharacters(in: .whitespacesAndNewlines)
        while limpio.hasSuffix("/") { limpio.removeLast() }
        if let rango = limpio.range(of: "/player_api.php") { limpio = String(limpio[..<rango.lowerBound]) }
        if !limpio.hasPrefix("http") { limpio = "http://" + limpio }
        return limpio
    }

    static func peticion(_ cuenta: CuentaXtream, accion: String?, extra: [String: String] = [:]) -> String {
        var partes = [
            "username=\(cuenta.usuario.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? cuenta.usuario)",
            "password=\(cuenta.clave.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? cuenta.clave)"
        ]
        if let accion { partes.append("action=\(accion)") }
        for (clave, valor) in extra { partes.append("\(clave)=\(valor)") }
        return "\(base(cuenta.servidor))/player_api.php?\(partes.joined(separator: "&"))"
    }

    // MARK: - Llamadas

    static func comprueba(_ cuenta: CuentaXtream) async throws -> InfoCuenta {
        let info = try await ClienteRed.json(peticion(cuenta, accion: nil), como: InfoCuenta.self)
        guard info.user_info?.auth?.entero == 1 else {
            throw ClienteRed.Fallo.formato("Usuario o contraseña incorrectos")
        }
        return info
    }

    private static func nombresCategoria(_ cuenta: CuentaXtream, accion: String) async -> [String: String] {
        guard let lista = try? await ClienteRed.json(peticion(cuenta, accion: accion), como: [Categoria].self) else { return [:] }
        return Dictionary(uniqueKeysWithValues: lista.compactMap { categoria in
            guard let id = categoria.category_id?.texto, let nombre = categoria.category_name else { return nil }
            return (id, nombre)
        })
    }

    /// Descarga el catálogo completo. Los episodios de cada serie se piden luego.
    static func catalogo(_ cuenta: CuentaXtream, aviso: @escaping (String) -> Void) async throws -> (canales: [Contenido], peliculas: [Contenido], series: [Contenido]) {
        aviso("Comprobando la cuenta…")
        _ = try await comprueba(cuenta)
        let raiz = base(cuenta.servidor)

        aviso("Descargando canales…")
        async let categoriasCanal = nombresCategoria(cuenta, accion: "get_live_categories")
        let canalesRemotos = (try? await ClienteRed.json(peticion(cuenta, accion: "get_live_streams"), como: [CanalRemoto].self)) ?? []
        let nombresCanal = await categoriasCanal
        let canales: [Contenido] = canalesRemotos.compactMap { canal in
            guard let id = canal.stream_id?.texto else { return nil }
            let titulo = Texto.limpia(canal.name ?? "")
            return Contenido(
                id: "canal-\(id)",
                tipo: .canal,
                titulo: titulo.isEmpty ? (canal.name ?? "Canal") : titulo,
                categoria: nombresCanal[canal.category_id?.texto ?? ""] ?? "Canales",
                caratula: canal.stream_icon,
                fuentes: [Fuente(url: "\(raiz)/live/\(cuenta.usuario)/\(cuenta.clave)/\(id).m3u8", etiqueta: "Directo")]
            )
        }

        aviso("Descargando películas…")
        async let categoriasPeli = nombresCategoria(cuenta, accion: "get_vod_categories")
        let peliculasRemotas = (try? await ClienteRed.json(peticion(cuenta, accion: "get_vod_streams"), como: [PeliculaRemota].self)) ?? []
        let nombresPeli = await categoriasPeli
        let peliculas: [Contenido] = peliculasRemotas.compactMap { pelicula in
            guard let id = pelicula.stream_id?.texto else { return nil }
            let bruto = pelicula.name ?? pelicula.title ?? ""
            let extension_ = pelicula.container_extension ?? "mp4"
            return Contenido(
                id: "peli-\(id)",
                tipo: .pelicula,
                titulo: Texto.limpia(bruto).isEmpty ? bruto : Texto.limpia(bruto),
                categoria: nombresPeli[pelicula.category_id?.texto ?? ""] ?? "Películas",
                caratula: pelicula.stream_icon ?? pelicula.cover,
                anyo: pelicula.year?.entero ?? Texto.anyo(pelicula.releaseDate ?? bruto),
                nota: pelicula.rating?.decimal,
                generos: Texto.generos(pelicula.genre),
                sinopsis: pelicula.plot,
                fuentes: [Fuente(url: "\(raiz)/movie/\(cuenta.usuario)/\(cuenta.clave)/\(id).\(extension_)", etiqueta: "Principal")]
            )
        }

        aviso("Descargando series…")
        async let categoriasSerie = nombresCategoria(cuenta, accion: "get_series_categories")
        let seriesRemotas = (try? await ClienteRed.json(peticion(cuenta, accion: "get_series"), como: [SerieRemota].self)) ?? []
        let nombresSerie = await categoriasSerie
        let series: [Contenido] = seriesRemotas.compactMap { serie in
            guard let id = serie.series_id?.entero else { return nil }
            let bruto = serie.name ?? ""
            return Contenido(
                id: "serie-\(id)",
                tipo: .serie,
                titulo: Texto.limpia(bruto).isEmpty ? bruto : Texto.limpia(bruto),
                categoria: nombresSerie[serie.category_id?.texto ?? ""] ?? "Series",
                caratula: serie.cover,
                anyo: Texto.anyo(serie.releaseDate ?? ""),
                nota: serie.rating?.decimal,
                generos: Texto.generos(serie.genre),
                sinopsis: serie.plot,
                idSerie: id,
                episodiosPendientes: true
            )
        }

        return (canales, peliculas, series)
    }

    /// Temporadas y episodios de una serie concreta.
    static func temporadas(_ cuenta: CuentaXtream, idSerie: Int) async throws -> [Temporada] {
        let raiz = base(cuenta.servidor)
        let respuesta = try await ClienteRed.json(
            peticion(cuenta, accion: "get_series_info", extra: ["series_id": String(idSerie)]),
            como: RespuestaSerie.self
        )
        let bruto = respuesta.episodes ?? [:]
        return bruto.keys.sorted { (Int($0) ?? 0) < (Int($1) ?? 0) }.map { clave in
            let episodios = (bruto[clave] ?? []).enumerated().map { indice, episodio -> Episodio in
                let id = episodio.id?.texto ?? "\(idSerie)-\(clave)-\(indice)"
                let extension_ = episodio.container_extension ?? "mp4"
                return Episodio(
                    id: id,
                    numero: episodio.episode_num?.entero ?? indice + 1,
                    titulo: episodio.title ?? "Episodio \(indice + 1)",
                    url: "\(raiz)/series/\(cuenta.usuario)/\(cuenta.clave)/\(id).\(extension_)",
                    imagen: episodio.info?.movie_image
                )
            }.sorted { $0.numero < $1.numero }
            return Temporada(numero: Int(clave) ?? 1, episodios: episodios)
        }
    }
}
