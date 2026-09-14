import SwiftUI
import ServiceManagement

@main
struct KortextApp: App {
    @StateObject private var model = Model()

    var body: some Scene {
        MenuBarExtra {
            Popover().environmentObject(model)
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

struct Popover: View {
    @EnvironmentObject var model: Model
    @State private var settings = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if settings { Settings(done: { settings = false }) } else { WaitingList() }
            Divider()
            StatusBar(settings: $settings)
        }
        .frame(width: 340)
    }
}

// The list is the popover: only what waits on the human, one line each, click to open.
struct WaitingList: View {
    @EnvironmentObject var model: Model

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(title).font(.system(size: 13, weight: .medium))
                Spacer()
                if !model.waiting.isEmpty { Text("\(model.waiting.count)").font(.system(size: 11).monospacedDigit()).foregroundStyle(.secondary) }
            }
            .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 6)
            ForEach(model.waiting) { w in WaitingRow(w: w) }
        }
        .padding(.bottom, 8)
    }

    private var title: String {
        if !model.installed { return "Kortext is not installed" }
        if model.version == nil { return "Kortext is not running" }
        if model.waiting.isEmpty { return model.anyRunning ? "Writing — nothing waiting on you" : "Nothing waiting on you" }
        return "Waiting on you"
    }
}

struct WaitingRow: View {
    @EnvironmentObject var model: Model
    let w: Model.Waiting
    @State private var hover = false

    var body: some View {
        Button { model.openPanel(project: w.project.id, doc: w.rel) } label: {
            HStack(spacing: 8) {
                Circle().fill(w.why == "failed" ? Color.red : Color.orange).frame(width: 7, height: 7)
                Text(w.rel).font(.system(size: 12, design: .monospaced))
                Text("|").foregroundStyle(.quaternary)
                Text(w.project.project.code).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
                Spacer()
                Text(w.why).font(.system(size: 11)).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14).padding(.vertical, 5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(hover ? Color.primary.opacity(0.06) : .clear)
        .onHover { hover = $0 }
    }
}

// The panel's status bar, in miniature: dot · name · version · power. Nothing shown that is not true now.
struct StatusBar: View {
    @EnvironmentObject var model: Model
    @Binding var settings: Bool
    @State private var armed = false

    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(model.version == nil ? Color.red : Color.green).frame(width: 7, height: 7)
            Text("Kortext").font(.system(size: 12, weight: .medium))
            if let v = model.version { Text(v).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary) }
            if model.installed {
                Button { power() } label: { Image(systemName: "power").font(.system(size: 11, weight: .semibold)) }
                    .buttonStyle(.plain).foregroundStyle(armed ? .red : .secondary)
                    .help(model.version == nil ? "Start the server" : armed ? "Click again to stop" : "Stop the server")
                if armed { Text("click again to stop").font(.system(size: 11)).foregroundStyle(.red) }
            }
            Spacer()
            Button { settings.toggle() } label: { Image(systemName: "gearshape").font(.system(size: 12)) }
                .buttonStyle(.plain).foregroundStyle(settings ? .primary : .secondary)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .onChange(of: armed) { _, on in
            if on { Task { try? await Task.sleep(for: .seconds(4)); armed = false } }
        }
    }

    private func power() {
        if model.version == nil { model.startDaemon(); return }
        if !armed { armed = true; return }
        armed = false
        model.stopDaemon()
    }
}

struct Settings: View {
    let done: () -> Void
    @State private var loginItem = SMAppService.mainApp.status == .enabled
    @AppStorage("notifications") private var notifications = true

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Settings").font(.system(size: 13, weight: .medium))
                Spacer()
                Button("Done", action: done).controlSize(.small)
            }
            Toggle("Launch at login", isOn: $loginItem).toggleStyle(.checkbox)
                .onChange(of: loginItem) { _, on in try? on ? SMAppService.mainApp.register() : SMAppService.mainApp.unregister() }
            Toggle("Notify when a document waits on me", isOn: $notifications).toggleStyle(.checkbox)
            Text("A draft to approve, a failed step, a brief with questions, a finished chain.")
                .font(.system(size: 11)).foregroundStyle(.secondary).padding(.leading, 18).fixedSize(horizontal: false, vertical: true)
            Divider().padding(.top, 2)
            Button("Quit Kortext") { NSApp.terminate(nil) }.controlSize(.small)
        }
        .font(.system(size: 12))
        .padding(14)
    }
}
