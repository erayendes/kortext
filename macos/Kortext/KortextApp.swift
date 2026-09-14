import SwiftUI
import ServiceManagement
import Sparkle

@main
struct KortextApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    var body: some Scene { Settings { EmptyView() } }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var status: StatusController?
    private let model = Model()
    // Sparkle keeps the app current from macos/appcast.xml; the npm package keeps itself current through the daemon.
    private let updater = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)

    func applicationDidFinishLaunching(_ n: Notification) {
        applyTheme()
        model.checkAppUpdate = { [updater] in updater.checkForUpdates(nil) }
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
            if settings {
                SettingsView()
            } else {
                Content()
                Divider()
                StatusBar()
            }
        }
        .frame(width: 300)
        .background(Backdrop())
    }
}

// mimir's ambient layer over the desktop blur: a whisper of tint and two corner glows —
// here in kortext's colours, the blueprint blue and the sketch grey.
struct Backdrop: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let dark = scheme == .dark
        ZStack {
            LinearGradient(colors: dark ? [Color(hex: 0x12121A), Color(hex: 0x0C0D14), Color(hex: 0x08090E)]
                                        : [Color(hex: 0xF4F4F7), Color(hex: 0xECECEF), Color(hex: 0xE6E6EA)],
                           startPoint: .top, endPoint: .bottom)
                .opacity(dark ? 0.05 : 0.04)
            RadialGradient(colors: [Color(hex: 0x0865FF).opacity(dark ? 0.10 : 0.07), .clear],
                           center: .topTrailing, startRadius: 8, endRadius: 280)
            RadialGradient(colors: [Color(hex: 0x9CA3AF).opacity(dark ? 0.08 : 0.06), .clear],
                           center: .bottomLeading, startRadius: 8, endRadius: 280)
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255)
    }
}

struct Header: View {
    @Binding var settings: Bool
    var body: some View {
        HStack {
            if settings {
                Button { settings = false } label: {
                    HStack(spacing: 7) { Icon(name: "chevron.left", size: 11, color: Kx.fgSecondary, weight: .semibold); Image("wordmark").resizable().scaledToFit().frame(height: 14) }
                }.buttonStyle(.plain)
                Spacer()
                ThemeCycle()
            } else {
                Image("wordmark").resizable().scaledToFit().frame(height: 14)
                Spacer()
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
                Text(p.project.name.uppercased()).font(.system(size: 10, weight: .medium)).tracking(0.9).foregroundStyle(Color.primary.opacity(0.5)).lineLimit(1)
                Spacer()
                Text("\(p.project.docCounts.settled)/\(p.project.docCounts.total)").font(Kx.mono(10)).foregroundStyle(Color.primary.opacity(0.35))
            }
            .padding(.horizontal, 14).padding(.top, 11).padding(.bottom, 4)
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, w in
                if i > 0 { Divider().padding(.leading, 14) }
                WaitingRow(w: w)
            }
        }
        .padding(.bottom, 4)
        // mimir's card: the system's regular material on the glass, a hairline around it.
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.regularMaterial))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
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
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(.regularMaterial))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
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
                Text(w.rel).font(Kx.mono(13, .medium)).foregroundStyle(Kx.fg)
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

// The panel's one setting, as its header button: auto → light → dark, one glyph showing what is on.
struct ThemeCycle: View {
    @AppStorage("theme") private var theme = "auto"
    var body: some View {
        let icon = theme == "light" ? "sun.max" : theme == "dark" ? "moon" : "circle.lefthalf.filled"
        Button { theme = theme == "auto" ? "light" : theme == "light" ? "dark" : "auto" } label: {
            Icon(name: icon, size: 13).frame(width: 26, height: 26)
        }
        .buttonStyle(.plain)
        .help("Theme: \(theme)")
    }
}

struct SettingsView: View {
    @EnvironmentObject var model: Model
    @AppStorage("notifications") private var notifications = true
    @State private var loginItem = SMAppService.mainApp.status == .enabled

    var body: some View {
        VStack(spacing: 0) {
            Row(icon: "power", title: "Launch at login", sub: "The server starts with it.", on: loginItem) {
                loginItem.toggle()
                try? loginItem ? SMAppService.mainApp.register() : SMAppService.mainApp.unregister()
            }
            Row(icon: "bell", title: "Notify when a document waits", on: notifications) {
                notifications.toggle()
                if notifications { model.ensureNotifications() }
            }
            Row(icon: "arrow.down.circle", title: "Check for updates", sub: model.update ?? (model.version.map { "kortext \($0)" } ?? nil)) { model.checkUpdates() }
            Row(icon: "ladybug", title: "Something wrong? Report an issue") {
                var u = "https://github.com/erayendes/kortext/issues/new?template=bug_report.yml"
                if let v = model.version { u += "&version=\(v)" }
                NSWorkspace.shared.open(URL(string: u)!)
            }
            Row(icon: "heart", title: "Like it? Support Kortext") { NSWorkspace.shared.open(URL(string: "https://buymeacoffee.com/erayendes")!) }
            Row(icon: "xmark.circle", title: "Quit Kortext", trailing: "⌘Q") { NSApp.terminate(nil) }
        }
        .padding(.vertical, 6)
    }
}

/// One settings row: a glyph, a title, an optional line under it; a checkmark when it is a toggle that is on.
struct Row: View {
    let icon: String
    let title: String
    var sub: String? = nil
    var on: Bool? = nil
    var trailing: String? = nil
    let action: () -> Void
    @State private var hover = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Icon(name: icon, size: 13, color: Kx.fgSecondary).frame(width: 18)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(Kx.sans(13)).foregroundStyle(Kx.fg)
                    if let sub { Text(sub).font(Kx.sans(11)).foregroundStyle(Kx.fgMuted).lineLimit(1) }
                }
                Spacer()
                if on == true { Icon(name: "checkmark", size: 11, color: Kx.fg, weight: .semibold) }
                if let trailing { Text(trailing).font(Kx.mono(10)).foregroundStyle(Kx.fgFaint) }
            }
            .padding(.horizontal, 14).padding(.vertical, 7)
            .background(hover ? Kx.bgHover : .clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}

