import Foundation

/// Un canal, una película o una serie: todo lo que se puede abrir en la app.
enum TipoContenido: String, Codable {
    case canal, pelicula, serie
}

struct Fuente: Codable, Hashable {
    var url: String
    var etiqueta: String
}

struct Episodio: Codable, Hashable, Identifiable {
    var id: String
    var numero: Int
    var titulo: String
    var url: String
    var imagen: String?
}

struct Temporada: Codable, Hashable, Identifiable {
    var id: String { "\(numero)" }
    var numero: Int
    var episodios: [Episodio]
}

struct Contenido: Codable, Identifiable, Hashable {
    var id: String
    var tipo: TipoContenido
    var titulo: String
    var categoria: String
    var caratula: String?
    var anyo: Int?
    var nota: Double?
    var generos: [String] = []
    var sinopsis: String?

    /// Canales y películas: dónde está el vídeo. Las series lo tienen por episodio.
    var fuentes: [Fuente] = []

    /// Series: se rellenan al abrir la ficha, para no descargar miles de capítulos.
    var temporadas: [Temporada] = []
    var idSerie: Int?
    var episodiosPendientes: Bool = false

    var numeroTemporadas: Int { temporadas.count }
    var numeroEpisodios: Int { temporadas.reduce(0) { $0 + $1.episodios.count } }
    var primeraUrl: String? {
        if let fuente = fuentes.first { return fuente.url }
        return temporadas.first?.episodios.first?.url
    }
}

/// Una lista guardada, con su catálogo ya ordenado.
struct Lista: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var nombre: String
    var clase: Clase
    var url: String?
    var servidor: String?
    var usuario: String?
    var clave: String?
    var actualizada: Date = .now

    var canales: [Contenido] = []
    var peliculas: [Contenido] = []
    var series: [Contenido] = []

    enum Clase: String, Codable { case xtream, m3u }

    var total: Int { canales.count + peliculas.count + series.count }

    var cuenta: CuentaXtream? {
        guard clase == .xtream, let servidor, let usuario, let clave else { return nil }
        return CuentaXtream(servidor: servidor, usuario: usuario, clave: clave)
    }
}

struct CuentaXtream: Hashable {
    var servidor: String
    var usuario: String
    var clave: String
}

/// Lo que se estaba viendo, para poder seguir donde se dejó.
struct Marcador: Codable, Identifiable, Hashable {
    var id: String
    var titulo: String
    var caratula: String?
    var url: String
    var segundo: Double
    var duracion: Double
    var fecha: Date = .now

    var progreso: Double { duracion > 0 ? min(segundo / duracion, 1) : 0 }
}
