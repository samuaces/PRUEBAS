import Foundation

/// Peticiones de red con la identificación que esperan los paneles IPTV.
/// Es la diferencia entre que el servidor conteste o cuelgue la conexión: los
/// navegadores no pueden hacer esto, una app nativa sí.
enum ClienteRed {
    static let agente = "VLC/3.0.20 LibVLC/3.0.20"

    static let sesion: URLSession = {
        let configuracion = URLSessionConfiguration.default
        configuracion.httpAdditionalHeaders = ["User-Agent": agente, "Accept": "*/*"]
        configuracion.timeoutIntervalForRequest = 30
        configuracion.timeoutIntervalForResource = 300
        configuracion.waitsForConnectivity = true
        return URLSession(configuration: configuracion)
    }()

    enum Fallo: LocalizedError {
        case direccionInvalida
        case servidor(Int)
        case sinRespuesta(String)
        case formato(String)

        var errorDescription: String? {
            switch self {
            case .direccionInvalida: return "La dirección no es válida"
            case .servidor(let codigo): return "El servidor respondió \(codigo)"
            case .sinRespuesta(let detalle): return "Sin respuesta: \(detalle)"
            case .formato(let detalle): return detalle
            }
        }
    }

    /// La misma dirección por http y por https: muchos paneles solo atienden una.
    static func variantes(_ direccion: String) -> [String] {
        var salida = [direccion]
        if direccion.hasPrefix("https:") {
            salida.append(direccion
                .replacingOccurrences(of: "https:", with: "http:")
                .replacingOccurrences(of: ":443/", with: "/"))
        } else if direccion.hasPrefix("http:") {
            salida.append(direccion.replacingOccurrences(of: "http:", with: "https:"))
        }
        return Array(NSOrderedSet(array: salida)) as? [String] ?? salida
    }

    /// Descarga probando las dos formas de la dirección.
    static func datos(_ direccion: String) async throws -> Data {
        var ultimo: Error = Fallo.direccionInvalida
        for variante in variantes(direccion) {
            guard let url = URL(string: variante) else { continue }
            do {
                let (datos, respuesta) = try await sesion.data(from: url)
                if let http = respuesta as? HTTPURLResponse, http.statusCode >= 400 {
                    ultimo = Fallo.servidor(http.statusCode)
                    continue
                }
                return datos
            } catch {
                ultimo = Fallo.sinRespuesta(error.localizedDescription)
            }
        }
        throw ultimo
    }

    static func texto(_ direccion: String) async throws -> String {
        let datos = try await datos(direccion)
        return String(data: datos, encoding: .utf8)
            ?? String(data: datos, encoding: .isoLatin1)
            ?? ""
    }

    static func json<T: Decodable>(_ direccion: String, como tipo: T.Type) async throws -> T {
        let datos = try await datos(direccion)
        do {
            return try JSONDecoder().decode(tipo, from: datos)
        } catch {
            let muestra = String(data: datos.prefix(120), encoding: .utf8) ?? ""
            throw Fallo.formato("El panel no devolvió datos válidos: \(muestra)")
        }
    }
}
