import SwiftUI

/// Pegar el enlace y listo. Debajo, por si acaso, los datos por separado.
struct AltaLista: View {
    @EnvironmentObject private var biblioteca: Biblioteca
    @Environment(\.dismiss) private var cerrar
    var comoHoja: Bool = false

    @State private var enlace = ""
    @State private var nombre = ""
    @State private var manual = false
    @State private var servidor = ""
    @State private var usuario = ""
    @State private var clave = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Pega aquí el enlace de tu lista", text: $enlace, axis: .vertical)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .lineLimit(1...4)

                    TextField("Nombre (opcional)", text: $nombre)

                    Button {
                        Task {
                            await biblioteca.anyadeDesdeEnlace(nombre: nombre, direccion: enlace.trimmingCharacters(in: .whitespacesAndNewlines))
                            if biblioteca.ultimoError == nil && comoHoja { cerrar() }
                        }
                    } label: {
                        if biblioteca.cargando {
                            HStack { ProgressView(); Text(biblioteca.paso.isEmpty ? "Cargando…" : biblioteca.paso) }
                        } else {
                            Text("Cargar lista").frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(enlace.isEmpty || biblioteca.cargando)
                } header: {
                    Text("Tu lista")
                } footer: {
                    Text("Vale el enlace que te dio tu proveedor, sea de tipo get.php o una lista M3U. La app detecta sola cuál es y se guarda en este teléfono.")
                }

                Section("Con usuario y contraseña") {
                    DisclosureGroup("Escribir los datos por separado", isExpanded: $manual) {
                        TextField("Servidor (http://…)", text: $servidor)
                            .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                        TextField("Usuario", text: $usuario)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        SecureField("Contraseña", text: $clave)
                        Button("Conectar") {
                            Task {
                                await biblioteca.anyadeXtream(nombre: nombre, servidor: servidor, usuario: usuario, clave: clave)
                                if biblioteca.ultimoError == nil && comoHoja { cerrar() }
                            }
                        }
                        .disabled(servidor.isEmpty || usuario.isEmpty || biblioteca.cargando)
                    }
                }

                if let error = biblioteca.ultimoError {
                    Section("No se ha podido") {
                        Text(error).font(.footnote).foregroundStyle(.red)
                        Text("Comprueba que el enlace es el que te dio tu proveedor y que sigue activo.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle(biblioteca.listas.isEmpty ? "Cookie Play" : "Añadir lista")
            .toolbar {
                if comoHoja {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cerrar") { cerrar() }
                    }
                }
            }
        }
    }
}
