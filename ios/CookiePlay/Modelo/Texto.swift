import Foundation

/// Limpieza de títulos: quita prefijos de país, etiquetas de calidad e idioma,
/// para que la rejilla se lea como una biblioteca y no como un volcado.
enum Texto {
    private static let calidad = try! NSRegularExpression(
        pattern: "\\b(4k|uhd|fhd|hd|sd|hq|hevc|h265|x265|x264|1080p?|720p?|480p?|2160p?|dolby|atmos|dts|multi|dual|remux|bluray|web-?dl|webrip|hdrip|dvdrip|ac3|aac|10bit)\\b",
        options: .caseInsensitive)
    private static let idiomaFinal = try! NSRegularExpression(
        pattern: "[\\s\\-–—|:.]*\\b(cast(ellano)?|lat(ino)?|esp|spa|eng|vose|vos|sub(titulad[oa]s?)?|dual|multi|original)\\b[\\s\\-–—|:.]*$",
        options: .caseInsensitive)
    private static let prefijoPais = try! NSRegularExpression(
        pattern: "^\\s*(?:\\|?\\s*[A-Z]{2,4}\\s*\\|)\\s*|^\\s*[A-Z]{2,4}\\s*[-:]\\s+")
    private static let parentesis = try! NSRegularExpression(pattern: "[\\[(\\{][^\\])\\}]*[\\])\\}]")
    private static let anyoPatron = try! NSRegularExpression(pattern: "\\b(19\\d{2}|20\\d{2})\\b")

    private static func quita(_ patron: NSRegularExpression, en texto: String, por reemplazo: String = " ") -> String {
        let rango = NSRange(texto.startIndex..., in: texto)
        return patron.stringByReplacingMatches(in: texto, range: rango, withTemplate: reemplazo)
    }

    static func limpia(_ bruto: String) -> String {
        var titulo = bruto.trimmingCharacters(in: .whitespacesAndNewlines)
        titulo = quita(prefijoPais, en: titulo, por: "")
        titulo = quita(parentesis, en: titulo)
        titulo = quita(calidad, en: titulo)
        for _ in 0..<4 {
            let corto = quita(idiomaFinal, en: titulo, por: "")
            if corto == titulo { break }
            titulo = corto
        }
        titulo = quita(anyoPatron, en: titulo)
        titulo = titulo.replacingOccurrences(of: "_", with: " ")
        while titulo.contains("  ") { titulo = titulo.replacingOccurrences(of: "  ", with: " ") }
        titulo = titulo.trimmingCharacters(in: CharacterSet(charactersIn: " -–—|:."))
        return titulo.isEmpty ? bruto.trimmingCharacters(in: .whitespacesAndNewlines) : titulo
    }

    static func anyo(_ texto: String) -> Int? {
        let rango = NSRange(texto.startIndex..., in: texto)
        guard let coincidencia = anyoPatron.firstMatch(in: texto, range: rango),
              let sub = Range(coincidencia.range, in: texto) else { return nil }
        return Int(texto[sub])
    }

    static func generos(_ bruto: String?) -> [String] {
        guard let bruto, !bruto.isEmpty else { return [] }
        return bruto.split(whereSeparator: { ",/|".contains($0) })
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    /// Sin tildes y en minúsculas, para buscar sin pelearse con los acentos.
    static func plano(_ texto: String) -> String {
        texto.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es"))
    }

    static func iniciales(_ titulo: String) -> String {
        let palabras = titulo.split(separator: " ").prefix(2)
        return palabras.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }
}
