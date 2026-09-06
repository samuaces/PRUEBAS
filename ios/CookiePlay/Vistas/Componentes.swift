import SwiftUI

/// Carátula con degradado de reserva: las listas traen muchas imágenes rotas.
struct Caratula: View {
    let contenido: Contenido
    var proporcion: CGFloat = 2.0 / 3.0

    private var colores: [Color] {
        let semilla = abs(contenido.titulo.hashValue)
        let matiz = Double(semilla % 360) / 360
        return [
            Color(hue: matiz, saturation: 0.55, brightness: 0.52),
            Color(hue: (matiz + 0.12).truncatingRemainder(dividingBy: 1), saturation: 0.6, brightness: 0.3)
        ]
    }

    var body: some View {
        ZStack {
            LinearGradient(colors: colores, startPoint: .topLeading, endPoint: .bottomTrailing)
            Text(Texto.iniciales(contenido.titulo))
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(.white.opacity(0.9))

            if let direccion = contenido.caratula, let url = URL(string: direccion) {
                AsyncImage(url: url) { imagen in
                    imagen.resizable().scaledToFill()
                } placeholder: {
                    Color.clear
                }
            }
        }
        .aspectRatio(proporcion, contentMode: .fill)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(alignment: .topLeading) {
            if let nota = contenido.nota, nota > 0 {
                Text(String(format: "★ %.1f", nota))
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 6).padding(.vertical, 3)
                    .background(.black.opacity(0.55), in: Capsule())
                    .foregroundStyle(Color(red: 0.94, green: 0.72, blue: 0.4))
                    .padding(6)
            }
        }
    }
}

/// Tarjeta de la rejilla.
struct TarjetaContenido: View {
    let contenido: Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Caratula(contenido: contenido)
            Text(contenido.titulo)
                .font(.footnote.weight(.medium))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            if let detalle {
                Text(detalle).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private var detalle: String? {
        switch contenido.tipo {
        case .serie:
            if contenido.episodiosPendientes { return contenido.categoria }
            return "\(contenido.numeroTemporadas) temp."
        case .pelicula:
            return contenido.anyo.map(String.init) ?? contenido.categoria
        case .canal:
            return contenido.categoria
        }
    }
}

/// Fila de canal.
struct FilaCanal: View {
    let contenido: Contenido

    var body: some View {
        HStack(spacing: 12) {
            Caratula(contenido: contenido, proporcion: 1)
                .frame(width: 46, height: 46)
            VStack(alignment: .leading, spacing: 2) {
                Text(contenido.titulo).font(.subheadline.weight(.medium)).lineLimit(1)
                Text(contenido.categoria).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            Image(systemName: "play.circle.fill")
                .font(.title3)
                .foregroundStyle(.tint)
        }
        .contentShape(Rectangle())
    }
}

/// Carrusel horizontal con título.
struct Carrusel: View {
    let titulo: String
    let contenidos: [Contenido]
    var alPulsar: (Contenido) -> Void

    var body: some View {
        if !contenidos.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(titulo).font(.title3.bold())
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: 14) {
                        ForEach(contenidos) { contenido in
                            Button { alPulsar(contenido) } label: {
                                TarjetaContenido(contenido: contenido).frame(width: 130)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 2)
                }
            }
        }
    }
}

/// Rejilla que no se atraganta con listas de miles de títulos.
struct RejillaContenido: View {
    let contenidos: [Contenido]
    var alPulsar: (Contenido) -> Void

    private let columnas = [GridItem(.adaptive(minimum: 110), spacing: 14)]

    var body: some View {
        LazyVGrid(columns: columnas, spacing: 18) {
            ForEach(contenidos) { contenido in
                Button { alPulsar(contenido) } label: {
                    TarjetaContenido(contenido: contenido)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal)
    }
}

struct Vacio: View {
    let simbolo: String
    let titulo: String
    let detalle: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: simbolo).font(.system(size: 40)).foregroundStyle(.secondary)
            Text(titulo).font(.headline)
            Text(detalle).font(.subheadline).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(40)
    }
}
