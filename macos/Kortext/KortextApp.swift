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
        .menuBarExtraStyle(.window)
    }
}

struct MenuContent: View {
    @EnvironmentObject var model: Model
    @State private var loginItem = SMAppService.mainApp.status == .enabled

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header.padding(.horizontal, 14).padding(.vertical, 10)
            Divider()
            if model.version != nil {
                // ponytail: no ScrollView — a ScrollView in a MenuBarExtra window collapses to zero height; add one with a measured height when a machine holds more projects than a screen.
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(model.projects) { p in ProjectSection(p: p) }
                }
                Divider()
            }
            footer.padding(.horizontal, 8).padding(.vertical, 6)
        }
        .frame(width: 380)
    }

    @ViewBuilder private var header: some View {
        HStack {
            if !model.installed {
                Text("Kortext is not installed").fontWeight(.medium)
                Spacer()
                Button("Copy  npm i -g kortext") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString("npm i -g kortext", forType: .string)
                }.controlSize(.small)
            } else if let v = model.version {
                Text("Kortext \(v)").fontWeight(.medium)
                Spacer()
                if model.draftCount > 0 { Text("\(model.draftCount) awaiting approval").foregroundStyle(.secondary) }
                else if model.anyRunning { Text("writing").foregroundStyle(.secondary) }
                Button("Stop") { model.stopDaemon() }.controlSize(.small)
            } else {
                Text("Kortext is not running").fontWeight(.medium)
                Spacer()
                Button("Start") { model.startDaemon() }.controlSize(.small)
            }
        }
        .font(.system(size: 13))
    }

    private var footer: some View {
        HStack {
            Toggle("Launch at login", isOn: $loginItem).toggleStyle(.checkbox)
                .onChange(of: loginItem) { _, on in try? on ? SMAppService.mainApp.register() : SMAppService.mainApp.unregister() }
            Spacer()
            Button("Open panel") { model.openPanel() }
            Button("Quit") { NSApp.terminate(nil) }
        }
        .controlSize(.small)
    }
}

struct ProjectSection: View {
    @EnvironmentObject var model: Model
    let p: ProjectState

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(p.project.code).font(.system(size: 11, weight: .medium, design: .monospaced))
                Text(p.project.name).font(.system(size: 13, weight: .medium))
                Spacer()
                Text("\(p.project.docCounts.settled) / \(p.project.docCounts.total)")
                    .font(.system(size: 11).monospacedDigit()).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 4)
            ForEach(p.docs) { doc in DocRow(p: p, doc: doc) }
        }
        .padding(.bottom, 6)
    }
}

struct DocRow: View {
    @EnvironmentObject var model: Model
    let p: ProjectState
    let doc: Doc
    @State private var hover = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Circle().fill(color).frame(width: 7, height: 7)
                Text(doc.rel).font(.system(size: 12, design: .monospaced))
                Text(label).font(.system(size: 11)).foregroundStyle(.secondary)
                Spacer()
                if doc.status == "draft" {
                    Button("Approve") { model.approve(p, doc) }
                }
                Button("Open") { model.openPanel(p, doc) }
            }
            .controlSize(.mini)
            if let e = model.errors["\(p.id)/\(doc.rel)"] {
                Text(e).font(.system(size: 11)).foregroundStyle(.red).padding(.leading, 15)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 3)
        .background(hover ? Color.primary.opacity(0.06) : .clear)
        .onHover { hover = $0 }
    }

    // DESIGN.md state colours: green approved · amber your turn · blue writing · red failed.
    private var color: Color {
        switch doc.state {
        case "approved": .green
        case "writing", "reading": .blue
        case "failed": .red
        case "waiting" where doc.status == "draft": .orange
        case "n/a": .clear
        default: .secondary.opacity(0.4)
        }
    }
    private var label: String {
        if doc.status == "draft" { return "awaiting approval" }
        if doc.status == "approved" { return "approved" }
        if doc.status == "not-applicable" { return "n/a" }
        switch doc.state {
        case "writing": return "writing…"
        case "reading": return "rechecking"
        case "failed": return "failed"
        case "paused": return "paused"
        default: return "queued"
        }
    }
}
