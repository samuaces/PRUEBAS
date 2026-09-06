import SwiftUI
import AVKit

/// Reproductor nativo: AVPlayer traga HLS y http sin las pegas del navegador.
struct Reproductor: View {
    let titulo: String
    let subtitulo: String
    let url: String
    let identificador: String
    var caratula: String?

    @EnvironmentObject private var biblioteca: Biblioteca
    @Environment(\.dismiss) private var cerrar
    @State private var reproductor: AVPlayer?
    @State private var fallo: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let reproductor {
                VideoPlayer(player: reproductor)
                    .ignoresSafeArea()
            }

            if let fallo {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle").font(.largeTitle)
                    Text("No se puede reproducir").font(.headline)
                    Text(fallo).font(.footnote).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Cerrar") { cerrar() }.buttonStyle(.borderedProminent)
                }
                .padding(28)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
                .padding(30)
            }
        }
        .overlay(alignment: .topLeading) {
            Button { cerrar() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.white, .black.opacity(0.4))
            }
            .padding()
        }
        .statusBarHidden()
        .onAppear(perform: arranca)
        .onDisappear(perform: guardaPosicion)
    }

    private func arranca() {
        guard let enlace = URL(string: url) else {
            fallo = "La dirección del vídeo no es válida"
            return
        }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)

        // El panel espera un reproductor, no un navegador.
        let recurso = AVURLAsset(url: enlace, options: [
            "AVURLAssetHTTPHeaderFieldsKey": ["User-Agent": ClienteRed.agente]
        ])
        let elemento = AVPlayerItem(asset: recurso)
        let nuevo = AVPlayer(playerItem: elemento)
        nuevo.allowsExternalPlayback = true

        if let marcador = biblioteca.marcador(de: identificador), marcador.segundo > 30 {
            nuevo.seek(to: CMTime(seconds: marcador.segundo, preferredTimescale: 1))
        }
        nuevo.play()
        reproductor = nuevo

        // Si a los quince segundos no ha arrancado, se avisa en vez de dejar la pantalla negra.
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
            if let elemento = reproductor?.currentItem, elemento.status == .failed {
                fallo = elemento.error?.localizedDescription ?? "El servidor no responde"
            }
        }
    }

    private func guardaPosicion() {
        guard let reproductor, let elemento = reproductor.currentItem else { return }
        let segundo = reproductor.currentTime().seconds
        let duracion = elemento.duration.seconds
        reproductor.pause()
        guard segundo.isFinite, segundo > 20 else { return }
        biblioteca.apunta(Marcador(
            id: identificador,
            titulo: titulo,
            caratula: caratula,
            url: url,
            segundo: segundo,
            duracion: duracion.isFinite ? duracion : 0
        ))
    }
}
