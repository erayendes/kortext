import SwiftUI
import ServiceManagement

@main
struct KortextApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    var body: some Scene { Settings { EmptyView() } }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var status: StatusController?
    private let model = Model()

    func applicationDidFinishLaunching(_ n: Notification) {
        applyTheme()
        NotificationCenter.default.addObserver(forName: UserDefaults.didChangeNotification, object: nil, queue: .main) { [weak self] _ in self?.applyTheme() }
        model.start()
        status = StatusController(model: model, content: Popover().environmentObject(model))
    }

    // The panel's one setting: auto follows the OS, light and dark override it — app-wide, so the token colours resolve.
    private func applyTheme() {
        let theme = UserDefaults.standard.string(forKey: "theme") ?? "auto"
        let want: NSAppearance? = theme == "light" ? NSAppearance(named: .aqua) : theme == "dark" ? NSAppearance(named: .darkAqua) : nil
        if NSApp.appearance?.name != want?.name { NSApp.appearance = want }
    }
}

// Header · body · status bar. The popover is the panel's vocabulary at 300 wide.
struct Popover: View {
    @EnvironmentObject var model: Model
    @State private var settings = false

    var body: some View {
        VStack(spacing: 0) {
            Header(settings: $settings)
            Divider()
            if settings { SettingsView() } else { Content() }
            Divider()
            StatusBar()
        }
        .frame(width: 300)
    }
}

struct Header: View {
    @Binding var settings: Bool
    var body: some View {
        HStack {
            Image("wordmark").resizable().scaledToFit().frame(height: 14)
            Spacer()
            if settings {
                Button("Done") { settings = false }.buttonStyle(.plain).font(Kx.sans(11, .medium)).foregroundStyle(Kx.fgSecondary)
            } else {
                Button { settings = true } label: { Icon(name: "gearshape", size: 13) }.buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12).frame(height: 40)
    }
}

struct Eyebrow: View {
    let text: String; var count: Int? = nil
    var body: some View {
        HStack {
            Text(text.uppercased()).font(Kx.mono(10, .medium)).tracking(0.8).foregroundStyle(Kx.fgMuted)
            Spacer()
            if let count { Text("\(count)").font(Kx.mono(10)).foregroundStyle(Kx.fgFaint) }
        }
        .padding(.horizontal, 12).padding(.top, 12).padding(.bottom, 6)
    }
}

struct Content: View {
    @EnvironmentObject var model: Model
    var body: some View {
        if !model.installed { NotInstalled() }
        else if model.version == nil { Message(title: "Kortext is not running", sub: "Press ⏻ below to start the server.") }
        else if model.waiting.isEmpty { Empty() }
        else {
            // One card per project, its documents as rows — the way mimir groups a provider's lines.
            VStack(spacing: 10) {
                ForEach(model.projects.filter { p in model.waiting.contains { $0.project.id == p.id } }) { p in
                    ProjectCard(p: p, rows: model.waiting.filter { $0.project.id == p.id })
                }
            }
            .padding(12)
        }
    }
}

struct ProjectCard: View {
    let p: ProjectState
    let rows: [Model.Waiting]
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Text(p.project.code).font(Kx.mono(11, .semibold)).tracking(0.6).foregroundStyle(Kx.fgMuted)
                Text(p.project.name).font(Kx.sans(11)).foregroundStyle(Kx.fgFaint)
                Spacer()
                Text("\(p.project.docCounts.settled)/\(p.project.docCounts.total)").font(Kx.mono(10)).foregroundStyle(Kx.fgFaint)
            }
            .padding(.horizontal, 14).padding(.top, 11).padding(.bottom, 4)
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, w in
                if i > 0 { Divider().padding(.leading, 14) }
                WaitingRow(w: w)
            }
        }
        .padding(.bottom, 4)
        .background(Kx.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Kx.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct Message: View {
    let title: String; let sub: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(Kx.sans(13, .medium)).foregroundStyle(Kx.fg)
            Text(sub).font(Kx.sans(12)).foregroundStyle(Kx.fgMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).padding(.vertical, 18)
    }
}

// Nothing to decide; if a step is in flight, name it and offer the one control that stops it.
struct Empty: View {
    @EnvironmentObject var model: Model
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Nothing waiting on you").font(Kx.sans(13, .medium)).foregroundStyle(Kx.fg)
            if let r = model.runningLine {
                HStack(spacing: 8) {
                    (Text("\(r.project.project.code) is writing ").font(Kx.sans(12)).foregroundStyle(Kx.fgMuted)
                     + Text(r.job.doc_rel).font(Kx.mono(12)).foregroundStyle(Kx.fgSecondary))
                    Spacer()
                    Button { model.pause(r.project) } label: {
                        HStack(spacing: 4) { Icon(name: "pause.fill", size: 9, color: Kx.fgSecondary); Text("Pause").font(Kx.sans(11, .medium)).foregroundStyle(Kx.fgSecondary) }
                            .padding(.horizontal, 8).frame(height: 22)
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Kx.border, lineWidth: 1))
                    }.buttonStyle(.plain)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).padding(.vertical, 18)
    }
}

struct NotInstalled: View {
    @State private var copied = false
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Kortext is not installed").font(Kx.sans(13, .medium)).foregroundStyle(Kx.fg)
            HStack(spacing: 8) {
                Text("npm i -g kortext").font(Kx.mono(12)).foregroundStyle(Kx.fg)
                Spacer()
                Button {
                    NSPasteboard.general.clearContents(); NSPasteboard.general.setString("npm i -g kortext", forType: .string); copied = true
                } label: {
                    HStack(spacing: 4) { Icon(name: copied ? "checkmark" : "doc.on.doc", size: 11, color: Kx.fgSecondary); Text(copied ? "Copied" : "Copy").font(Kx.sans(11, .medium)).foregroundStyle(Kx.fgSecondary) }
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 10).padding(.vertical, 7)
            .background(Kx.card).overlay(RoundedRectangle(cornerRadius: 8).stroke(Kx.border, lineWidth: 1)).clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).padding(.top, 18).padding(.bottom, 16)
    }
}

// One decision per row: the document, its project, why it waits. Click opens it in the panel.
struct WaitingRow: View {
    @EnvironmentObject var model: Model
    let w: Model.Waiting
    @State private var hover = false

    var body: some View {
        Button { model.openPanel(project: w.project.id, doc: w.rel) } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(w.rel).font(Kx.mono(13, .medium)).foregroundStyle(Kx.fg)
                    if case .failed(let e?) = w.why {
                        Text(e).font(Kx.mono(11)).foregroundStyle(Kx.red).lineLimit(3).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
                switch w.why {
                case .approve: Pill(kind: .approve, text: "Approve")
                case .failed: Pill(kind: .failed, text: "Failed")
                case .questions(let n): Pill(kind: .questions, text: n == 1 ? "1 question" : "\(n) questions")
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(hover ? Kx.bgHover : .clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}

// The status bar: ⏻ (server and app together) · the version, which checks for updates when clicked · the credit, a link.
struct StatusBar: View {
    @EnvironmentObject var model: Model
    @State private var armed = false
    @State private var hoverVersion = false

    var body: some View {
        let up = model.version != nil
        HStack(spacing: 8) {
            if model.installed {
                Button { power() } label: {
                    Icon(name: "power", size: 12, color: armed ? Kx.red : up ? Kx.green : Kx.fgFaint, weight: .semibold).frame(width: 18, height: 18)
                }
                .buttonStyle(.plain).padding(.leading, -3)
                .help(!up ? "Start the server" : armed ? "Press again to quit Kortext and stop the server" : "Quit Kortext and stop the server")
            }
            if armed {
                Text("Press again to quit and stop the server").font(Kx.sans(11, .medium)).foregroundStyle(Kx.red).lineLimit(1).fixedSize()
                    .padding(.horizontal, 8).frame(height: 20)
                    .background(Kx.red.opacity(0.09)).clipShape(Capsule())
            } else if let v = model.version {
                Button { model.checkUpdates() } label: {
                    Text(model.update ?? "v\(v)").font(Kx.mono(10)).foregroundStyle(hoverVersion ? Kx.fg : Kx.fgMuted).lineLimit(1)
                        .padding(.horizontal, 6).frame(height: 18)
                        .background(hoverVersion ? Kx.bgHover : .clear)
                        .overlay(Capsule().stroke(Kx.border, lineWidth: 1)).clipShape(Capsule())
                }
                .buttonStyle(.plain).onHover { hoverVersion = $0 }
                .help("Check for updates")
            }
            Spacer()
            if !armed {
                Link("milowda", destination: URL(string: "https://milowda.com")!)
                    .font(Kx.sans(11)).foregroundStyle(Kx.fgFaint).padding(.trailing, 4)
            }
        }
        .padding(.leading, 12).padding(.trailing, 8).frame(height: 40)
        .background(Color.primary.opacity(0.03))
        .onChange(of: armed) { _, on in if on { Task { try? await Task.sleep(for: .seconds(4)); armed = false } } }
    }

    // Down: start the server. Up: first press arms, second quits the app and stops the server with it.
    private func power() {
        if model.version == nil { model.startDaemon(); return }
        if !armed { armed = true; return }
        armed = false
        model.quitAll()
    }
}

struct SettingsView: View {
    @EnvironmentObject var model: Model
    @AppStorage("theme") private var theme = "auto"
    @AppStorage("notifications") private var notifications = true
    @State private var loginItem = SMAppService.mainApp.status == .enabled

    var body: some View {
        VStack(spacing: 0) {
            Eyebrow(text: "Settings")
            VStack(spacing: 0) {
                HStack {
                    Text("Theme").font(Kx.sans(13)).foregroundStyle(Kx.fg)
                    Spacer()
                    HStack(spacing: 2) {
                        ForEach([("auto", "circle.lefthalf.filled"), ("light", "sun.max"), ("dark", "moon")], id: \.0) { key, icon in
                            Button { theme = key } label: {
                                Icon(name: icon, size: 13, color: theme == key ? Kx.fg : Kx.fgMuted)
                                    .frame(width: 29, height: 29)
                                    .background(theme == key ? Kx.bgActive : .clear)
                                    .clipShape(RoundedRectangle(cornerRadius: 6))
                            }.buttonStyle(.plain)
                        }
                    }
                }
                .padding(.vertical, 6)
                Divider()
                Check(on: $loginItem, title: "Launch at login", sub: "The server starts with it, so the morning begins with the list, not with ⏻.")
                    .onChange(of: loginItem) { _, on in try? on ? SMAppService.mainApp.register() : SMAppService.mainApp.unregister() }
                Divider()
                Check(on: $notifications, title: "Notify when a document waits on me",
                      sub: "A draft to approve, a failed step, a brief with questions, a finished chain.")
                Divider()
                HStack {
                    Button("Quit the menu bar app") { NSApp.terminate(nil) }.buttonStyle(.plain).font(Kx.sans(11)).foregroundStyle(Kx.fgFaint)
                    Spacer()
                    Text("⌘Q").font(Kx.mono(10)).foregroundStyle(Kx.fgFaint)
                }
                .padding(.top, 12).padding(.bottom, 2)
            }
            .padding(.horizontal, 12).padding(.bottom, 12)
        }
    }
}

struct Check: View {
    @Binding var on: Bool
    let title: String; var sub: String? = nil
    var body: some View {
        Button { on.toggle() } label: {
            HStack(alignment: .top, spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 3).fill(on ? Kx.accent : Color.primary.opacity(0.06))
                    if on { Icon(name: "checkmark", size: 9, color: Kx.accentFg, weight: .bold) }
                    else { RoundedRectangle(cornerRadius: 3).stroke(Kx.borderStrong, lineWidth: 1) }
                }
                .frame(width: 14, height: 14).padding(.top, 3)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(Kx.sans(13)).foregroundStyle(Kx.fg)
                    if let sub { Text(sub).font(Kx.sans(11)).foregroundStyle(Kx.fgMuted).fixedSize(horizontal: false, vertical: true) }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 9).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
