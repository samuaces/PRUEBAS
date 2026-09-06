import SwiftUI

struct Ajustes: View {
    @EnvironmentObject private var biblioteca: Biblioteca
    @State private var anyadiendo = false

    var body: some View {
        List {
            Section("Mis listas") {
                ForEach(biblioteca.listas) { lista in
                    Button {
                        biblioteca.elige(lista.id)
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(lista.nombre).font(.body)
                                Text("\(lista.canales.count) canales · \(lista.peliculas.count) pelis · \(lista.series.count) series")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if lista.id == biblioteca.lista?.id {
                                Image(systemName: "checkmark").foregroundStyle(.tint)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .swipeActions {
                        Button(role: .destructive) { biblioteca.borra(lista.id) } label: {
                            Label("Quitar", systemImage: "trash")
                        }
                        Button {
                            Task { await biblioteca.actualiza(lista) }
                        } label: {
                            Label("Actualizar", systemImage: "arrow.clockwise")
                        }
                        .tint(.blue)
                    }
                }

                Button { anyadiendo = true } label: {
                    Label("Añadir otra lista", systemImage: "plus")
                }
            }

            if let lista = biblioteca.lista {
                Section("Lista activa") {
                    LabeledContent("Actualizada", value: lista.actualizada.formatted(date: .abbreviated, time: .shortened))
                    Button {
                        Task { await biblioteca.actualiza(lista) }
                    } label: {
                        if biblioteca.cargando {
                            HStack { ProgressView(); Text(biblioteca.paso.isEmpty ? "Actualizando…" : biblioteca.paso) }
                        } else {
                            Label("Actualizar ahora", systemImage: "arrow.clockwise")
                        }
                    }
                    .disabled(biblioteca.cargando)
                }
            }

            Section("Favoritos") {
                LabeledContent("Guardados", value: "\(biblioteca.favoritos.count)")
                Button("Vaciar favoritos", role: .destructive) {
                    biblioteca.favoritos.removeAll()
                    biblioteca.guarda()
                }
            }

            Section {
                LabeledContent("Versión", value: "1.0")
            } footer: {
                Text("Cookie Play guarda tus listas y favoritos solo en este iPhone. Nada sale del teléfono salvo las peticiones a tu propio proveedor.")
            }
        }
        .navigationTitle("Ajustes")
        .sheet(isPresented: $anyadiendo) { AltaLista(comoHoja: true) }
    }
}
