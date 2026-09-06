import Foundation

/// Convierte una lista M3U en contenido ordenado: canales, películas y series.
enum ParserM3U {

    private struct Entrada {
        var titulo: String
        var url: String
        var grupo: String
        var logo: String?
    }

    private static let patronAtributos = try! NSRegularExpression(pattern: "([a-zA-Z0-9_-]+)=\"([^\"]*)\"")
    private static let patronesEpisodio = [
        try! NSRegularExpression(pattern: "\\bS\\s?(\\d{1,2})\\s?[\\sxE._-]?\\s?E\\s?(\\d{1,3})\\b", options: .caseInsensitive),
        try! NSRegularExpression(pattern: "\\bT\\s?(\\d{1,2})\\s?[\\sxE._-]?\\s?E?\\s?(\\d{1,3})\\b", options: .caseInsensitive),
        try! NSRegularExpression(pattern: "\\b(\\d{1,2})\\s?x\\s?(\\d{1,3})\\b")
    ]

    private static func atributos(de cabecera: String) -> [String: String] {
        let rango = NSRange(cabecera.startIndex..., in: cabecera)
        var salida: [String: String] = [:]
        for coincidencia in patronAtributos.matches(in: cabecera, range: rango) {
            guard let clave = Range(coincidencia.range(at: 1), in: cabecera),
                  let valor = Range(coincidencia.range(at: 2), in: cabecera) else { continue }
            salida[String(cabecera[clave]).lowercased()] = String(cabecera[valor])
        }
        return salida
    }

    private static func episodio(_ titulo: String) -> (serie: String, temporada: Int, numero: Int, nombre: String)? {
        let rango = NSRange(titulo.startIndex..., in: titulo)
        for patron in patronesEpisodio {
            guard let m = patron.firstMatch(in: titulo, range: rango),
                  let rTemporada = Range(m.range(at: 1), in: titulo),
                  let rNumero = Range(m.range(at: 2), in: titulo),
                  let rTodo = Range(m.range, in: titulo),
                  let temporada = Int(titulo[rTemporada]),
                  let numero = Int(titulo[rNumero]),
                  temporada <= 60, numero <= 999 else { continue }
            let serie = String(titulo[titulo.startIndex..<rTodo.lowerBound])
                .trimmingCharacters(in: CharacterSet(charactersIn: " -–—_:."))
            let nombre = String(titulo[rTodo.upperBound...])
                .trimmingCharacters(in: CharacterSet(charactersIn: " -–—_:."))
            return (serie.isEmpty ? titulo : serie, temporada, numero, nombre)
        }
        return nil
    }

    static func catalogo(_ texto: String, ocultarAdulto: Bool = true) -> (canales: [Contenido], peliculas: [Contenido], series: [Contenido]) {
        var entradas: [Entrada] = []
        var pendiente: (titulo: String, grupo: String, logo: String?)?

        for linea in texto.split(separator: "\n", omittingEmptySubsequences: false) {
            let limpia = linea.trimmingCharacters(in: .whitespacesAndNewlines)
            if limpia.isEmpty { continue }
            if limpia.hasPrefix("#EXTINF") {
                let partes = limpia.split(separator: ",", maxSplits: 1, omittingEmptySubsequences: false)
                let cabecera = String(partes.first ?? "")
                let nombre = partes.count > 1 ? String(partes[1]).trimmingCharacters(in: .whitespaces) : ""
                let attrs = atributos(de: cabecera)
                pendiente = (nombre.isEmpty ? (attrs["tvg-name"] ?? "") : nombre,
                             attrs["group-title"] ?? "Otros",
                             attrs["tvg-logo"])
            } else if limpia.hasPrefix("#") {
                continue
            } else if let actual = pendiente {
                entradas.append(Entrada(titulo: actual.titulo, url: limpia, grupo: actual.grupo, logo: actual.logo))
                pendiente = nil
            }
        }

        var canales: [Contenido] = []
        var peliculas: [String: Contenido] = [:]
        var series: [String: Contenido] = [:]
        var temporadasPorSerie: [String: [Int: [Episodio]]] = [:]

        let adulto = try! NSRegularExpression(pattern: "(\\bxxx\\b|adult|porn|erotic|\\+18)", options: .caseInsensitive)

        for entrada in entradas {
            let paraFiltrar = "\(entrada.grupo) \(entrada.titulo)"
            if ocultarAdulto,
               adulto.firstMatch(in: paraFiltrar, range: NSRange(paraFiltrar.startIndex..., in: paraFiltrar)) != nil {
                continue
            }

            let ruta = entrada.url.split(separator: "?").first.map(String.init) ?? entrada.url
            let esVideo = ["mp4", "mkv", "avi", "m4v", "mov"].contains(where: { ruta.lowercased().hasSuffix(".\($0)") })
            let grupoPlano = Texto.plano(entrada.grupo)

            if ruta.contains("/series/") || episodio(entrada.titulo) != nil || (grupoPlano.contains("serie") && !grupoPlano.contains("canal")) {
                let datos = episodio(entrada.titulo)
                let nombreSerie = Texto.limpia(datos?.serie ?? entrada.titulo)
                let clave = Texto.plano(nombreSerie)
                if series[clave] == nil {
                    series[clave] = Contenido(id: "serie-\(clave)", tipo: .serie, titulo: nombreSerie,
                                              categoria: entrada.grupo, caratula: entrada.logo)
                }
                let temporada = datos?.temporada ?? 1
                let numero = datos?.numero ?? ((temporadasPorSerie[clave]?[temporada]?.count ?? 0) + 1)
                let episodio = Episodio(id: "\(clave)-\(temporada)-\(numero)", numero: numero,
                                        titulo: (datos?.nombre.isEmpty == false ? datos!.nombre : "Episodio \(numero)"),
                                        url: entrada.url, imagen: entrada.logo)
                temporadasPorSerie[clave, default: [:]][temporada, default: []].append(episodio)
                continue
            }

            if ruta.contains("/movie/") || esVideo || grupoPlano.contains("pelicul") || grupoPlano.contains("movie") || grupoPlano.contains("cine") || grupoPlano.contains("vod") {
                let titulo = Texto.limpia(entrada.titulo)
                let anyo = Texto.anyo(entrada.titulo)
                let clave = "\(Texto.plano(titulo))-\(anyo ?? 0)"
                if peliculas[clave] == nil {
                    peliculas[clave] = Contenido(id: "peli-\(clave)", tipo: .pelicula, titulo: titulo,
                                                 categoria: entrada.grupo, caratula: entrada.logo, anyo: anyo)
                }
                peliculas[clave]?.fuentes.append(Fuente(url: entrada.url, etiqueta: entrada.grupo))
                continue
            }

            let titulo = Texto.limpia(entrada.titulo)
            canales.append(Contenido(id: "canal-\(canales.count)-\(Texto.plano(titulo))", tipo: .canal,
                                     titulo: titulo.isEmpty ? entrada.titulo : titulo,
                                     categoria: entrada.grupo, caratula: entrada.logo,
                                     fuentes: [Fuente(url: entrada.url, etiqueta: "Directo")]))
        }

        for (clave, temporadas) in temporadasPorSerie {
            series[clave]?.temporadas = temporadas.keys.sorted().map { numero in
                Temporada(numero: numero, episodios: (temporadas[numero] ?? []).sorted { $0.numero < $1.numero })
            }
        }

        let porTitulo: (Contenido, Contenido) -> Bool = { $0.titulo.localizedCaseInsensitiveCompare($1.titulo) == .orderedAscending }
        return (canales, Array(peliculas.values).sorted(by: porTitulo), Array(series.values).sorted(by: porTitulo))
    }
}
