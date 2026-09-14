import SwiftUI
import ServiceManagement

@main
struct KortextApp: App {
    @StateObject private var model = Model()

    var body: some Scene {
        MenuBarExtra {
            MenuContent().environmentObject(model)
        } label: {
            let icon = model.version == nil ? "k.square" : "k.square.fill"
            Label { if model.draftCount > 0 { Text("\(model.draftCount)") } } icon: {
                Image(systemName: icon)
                    .symbolEffect(.pulse, isActive: model.anyRunning)
                    .opacity(model.installed ? 1 : 0.4)
            }
            .labelStyle(.titleAndIcon)
            .task { model.start() }
        }
    }
}

struct MenuContent: View {
    @EnvironmentObject var model: Model
    @State private var loginItem = SMAppService.mainApp.status == .enabled

    var body: some View {
        if !model.installed {
            Text("Kortext is not installed")
            Button("Copy  npm i -g kortext") {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString("npm i -g kortext", forType: .string)
            }
        } else if let v = model.version {
            Text(headline(v))
            ForEach(model.projects) { s in
                Button(line(s)) { model.openPanel() }
            }
            Divider()
            Button("Stop") { model.stopDaemon() }.keyboardShortcut("s")
        } else {
            Text("Kortext is not running")
            Button("Start") { model.startDaemon() }.keyboardShortcut("s")
        }
        Toggle("Launch at login", isOn: $loginItem).onChange(of: loginItem) { _, on in
            try? on ? SMAppService.mainApp.register() : SMAppService.mainApp.unregister()
        }
        Button("Open panel") { model.openPanel() }
        Divider()
        Button("Quit") { NSApp.terminate(nil) }.keyboardShortcut("q")
    }

    private func headline(_ v: String) -> String {
        let n = model.draftCount
        if n > 0 { return "Kortext \(v) · \(n) awaiting approval" }
        if model.anyRunning { return "Kortext \(v) · writing" }
        return "Kortext \(v)"
    }

    // One line per project: code, then the one thing that matters right now.
    private func line(_ s: ProjectState) -> String {
        let head = "\(s.project.code) — \(s.project.name)"
        if let j = s.running { return "\(head)   \(j.doc_rel) writing…" }
        if !s.drafts.isEmpty { return "\(head)   \(s.drafts.joined(separator: ", ")) awaiting approval" }
        if let f = s.failed { return "\(head)   \(f.doc_rel) failed" }
        if s.notReady { return "\(head)   brief too thin" }
        if s.complete { return "\(head)   ready" }
        return "\(head)   \(s.project.docCounts.settled) / \(s.project.docCounts.total)"
    }
}
