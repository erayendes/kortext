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
    private let channels = Channels()
    private lazy var updater = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: channels, userDriverDelegate: nil)

    func applicationDidFinishLaunching(_ n: Notification) {
        applyTheme()
        model.checkAppUpdate = { [updater] in updater.checkForUpdates(nil) }
        NotificationCenter.default.addObserver(forName: UserDefaults.didChangeNotification, object: nil, queue: .main) { [weak self] _ in self?.applyTheme() }
        model.start()
        status = StatusController(model: model, content: Popover().environmentObject(model))
    }

    // Sparkle asks which channels count; the server's channel answers (Model keeps the default).
final class Channels: NSObject, SPUUpdaterDelegate {
    func allowedChannels(for updater: SPUUpdater) -> Set<String> {
        UserDefaults.standard.bool(forKey: "beta") ? ["beta"] : []
    }
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
            if settings {
                SettingsView()
                SettingsBar()
            } else {
                Content()
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
            Button { settings.toggle() } label: {
                HStack(spacing: 7) {
                    if settings { Icon(name: "chevron.left", size: 11, color: Kx.fgSecondary, weight: .semibold) }
                    Image("wordmark").resizable().scaledToFit().frame(height: 14)
                }
            }.buttonStyle(.plain).hand()
            Spacer()
            if !settings {
                Button { settings = true } label: { Icon(name: "gearshape", size: 13).frame(width: 14) }.buttonStyle(.plain).hand()
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
    /// What the screen leaves for the list under the menu bar, less the header and the bar.
    static var cap: CGFloat {
        if let s = ProcessInfo.processInfo.environment["KORTEXT_CAP"], let v = Double(s) { return CGFloat(v) }
        return (NSScreen.main?.visibleFrame.height ?? 800) - 40 - 40 - 24
    }
    var body: some View {
        if !model.installed { NotInstalled() }
        else if model.version == nil {
            if model.busy != nil { Message(title: "Kortext is starting", sub: "A moment — the server is coming up.") }
            else { Message(title: "Kortext is not running", sub: "Click to start the server.") { model.startDaemon() } }
        }
        else if model.shown.isEmpty { Empty() }
        else {
            // One card per project, its documents as rows — the way mimir groups a provider's lines.
            // The list grows with the work and scrolls once it would outgrow the screen.
            // The panel is sized once, when it opens, so the list's height has to be known
            // then: estimated from the counts, and scrolled only when it would not fit.
            let list = VStack(spacing: 10) {
                ForEach(model.shown) { p in
                    ProjectCard(p: p, rows: model.waiting.filter { $0.project.id == p.id })
                }
            }
            .padding(12)
            let estimate = 24 + CGFloat(model.shown.count) * 52 + CGFloat(max(model.waiting.count, model.shown.count)) * 34
            if estimate > Self.cap {
                ScrollView(.vertical, showsIndicators: false) { list }.frame(height: Self.cap)
            } else {
                list
            }
        }
    }
}

struct ProjectCard: View {
    @EnvironmentObject var model: Model
    let p: ProjectState
    let rows: [Model.Waiting]
    @State private var hover = false
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Text(p.project.name.uppercased()).font(.system(size: 10, weight: .medium)).tracking(0.9).foregroundStyle(Color.primary.opacity(0.5)).lineLimit(1)
                Spacer()
                Text("\(p.project.docCounts.settled)/\(p.project.docCounts.total)").font(Kx.mono(10)).foregroundStyle(Color.primary.opacity(0.35))
            }
            .padding(.horizontal, 14).padding(.top, 11).padding(.bottom, 4)
            if rows.isEmpty, p.complete {
                // A settled project's one line is a row too: click opens the project in the panel.
                Button { model.openPanel(project: p.id, doc: nil) } label: {
                    Text("Every document is settled — AGENTS.md in force.").font(Kx.sans(12)).foregroundStyle(Kx.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 14).padding(.vertical, 7)
                        .background(hover ? Kx.bgHover : .clear)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain).hand().onHover { hover = $0 }
            }
            ForEach(rows) { w in WaitingRow(w: w) }
        }
        .padding(.bottom, 4)
        // mimir's card: the system's regular material on the glass, a hairline around it.
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.regularMaterial))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// One card, two lines; with an action the whole card is the button — the sub line says what it does.
struct Message: View {
    let title: String; let sub: String
    var action: (() -> Void)? = nil
    @State private var hover = false
    var body: some View {
        Button { action?() } label: {
            Card {
                // The panel is sized from the view's fitting size, where a Text claims one line; fixedSize makes it claim every line it wraps to.
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(Kx.sans(13, .medium)).foregroundStyle(Kx.fg).fixedSize(horizontal: false, vertical: true)
                    Text(sub).font(Kx.sans(12)).foregroundStyle(Kx.fgMuted).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(14)
                .background(hover && action != nil ? Kx.bgHover : .clear)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
        .onHover { hover = $0; if action != nil { if $0 { NSCursor.pointingHand.push() } else { NSCursor.pop() } } }
        .padding(12)
    }
}

// No project: say so. Projects, nothing to decide: the chain is idle — settled is a project card's word, said only when every document is.
struct Empty: View {
    @EnvironmentObject var model: Model
    var body: some View {
        if model.projects.isEmpty { Message(title: "No project yet", sub: "Click to open the panel and start one.") { model.openPanel() } }
        else { Message(title: "Nothing waiting on you", sub: "No step is running and nothing needs a decision. Click to open the panel.") { model.openPanel() } }
    }
}

struct NotInstalled: View {
    @State private var copied = false
    var body: some View {
        Card {
        VStack(alignment: .leading, spacing: 10) {
            Text("Kortext is not installed").font(Kx.sans(13, .medium)).foregroundStyle(Kx.fg)
            // The whole command row copies — the word at its end only says so.
            Button {
                NSPasteboard.general.clearContents(); NSPasteboard.general.setString("npm i -g kortext", forType: .string); copied = true
            } label: {
                HStack(spacing: 8) {
                    Text("npm i -g kortext").font(Kx.mono(12)).foregroundStyle(Kx.fg)
                    Spacer()
                    HStack(spacing: 4) { Icon(name: copied ? "checkmark" : "doc.on.doc", size: 11, color: Kx.fgSecondary); Text(copied ? "Copied" : "Copy").font(Kx.sans(11, .medium)).foregroundStyle(Kx.fgSecondary) }
                }
                .padding(.horizontal, 10).padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(.regularMaterial))
                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
                .contentShape(Rectangle())
            }.buttonStyle(.plain).hand()
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(14)
        }
        .padding(12)
    }
}

// One decision per row: the document, its project, why it waits. Click opens it in the panel.
struct WaitingRow: View {
    @EnvironmentObject var model: Model
    let w: Model.Waiting
    @State private var hover = false

    var body: some View {
        Button { model.openPanel(project: w.project.id, doc: w.doc.rel) } label: {
            HStack(spacing: 6) {
                Text(w.doc.rel).font(Kx.mono(13, .medium)).foregroundStyle(w.needs ? Kx.fg : Kx.fgMuted)
                Spacer(minLength: 0)
                // The panel's row: the detail badge, then the state — waiting says nothing beside a badge.
                if w.needs, let d = w.doc.detail, ["approve", "review", "recheck"].contains(d) { Pill(kind: .detail(d), text: d) }
                if w.doc.state != "waiting" { Pill(kind: .state(w.doc.state), text: w.doc.state == "writing" || w.doc.state == "reading" ? "\(w.doc.state)…" : w.doc.state) }
            }
            .padding(.horizontal, 14).padding(.vertical, 7)
            .background(hover && w.needs ? Kx.bgHover : .clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!w.needs)   // a step in flight is a fact, not a decision — nothing to open
        .onHover { hover = $0; if w.needs { if $0 { NSCursor.pointingHand.push() } else { NSCursor.pop() } } }
    }
}

// The status bar: ⏻ (server and app together) · the version, which checks for updates when clicked · the credit, a link.
struct StatusBar: View {
    @EnvironmentObject var model: Model
    @State private var armed = false

    var body: some View {
        let up = model.version != nil
        let busy = model.busy != nil
        HStack(spacing: 8) {
            if model.installed {
                // The press shows at once: a spinner where ⏻ was, the word beside it, until health answers.
                Button { power() } label: {
                    if busy { ProgressView().controlSize(.mini).frame(width: 14, height: 18) }
                    else { Icon(name: "power", size: 12, color: armed ? Kx.red : up ? Kx.green : Kx.fgFaint, weight: .semibold).frame(width: 14, height: 18) }
                }
                .buttonStyle(.plain).hand().disabled(busy)
                .help(!up ? "Start the server" : armed ? "Press again to stop the server" : "Stop the server")
                if let b = model.busy {
                    Text("\(b)…").font(Kx.sans(11)).foregroundStyle(Kx.fgMuted)
                } else if up, !armed {
                    Button { model.openPanel() } label: {
                        Text("open panel").font(Kx.sans(11)).foregroundStyle(Kx.fgSecondary)
                    }
                    .buttonStyle(.plain).hand().help("Open the panel in your browser")
                }
            }
            if armed {
                Text("Press again to stop the server").font(Kx.sans(11, .medium)).foregroundStyle(Kx.red).lineLimit(1).fixedSize()
                    .padding(.horizontal, 8).frame(height: 20)
                    .background(Kx.red.opacity(0.09)).clipShape(Capsule())
            }
            Spacer()
            if !armed {
                Credit()
                    .font(Kx.sans(11)).foregroundStyle(Kx.fgFaint)
            }
        }
        .padding(.horizontal, 12).frame(height: 40)
        .onChange(of: armed) { _, on in if on { Task { try? await Task.sleep(for: .seconds(4)); armed = false } } }
    }

    // Down: start the server. Up: first press arms, second stops the server; the app stays.
    private func power() {
        if model.version == nil { model.startDaemon(); return }
        if !armed { armed = true; return }
        armed = false
        model.stopDaemon()
    }
}

// The panel's one setting, as its header button: auto → light → dark, one glyph showing what is on.
struct ThemeCycle: View {
    @AppStorage("theme") private var theme = "auto"
    var body: some View {
        let icon = theme == "light" ? "sun.max" : theme == "dark" ? "moon" : "circle.lefthalf.filled"
        Button { theme = theme == "auto" ? "light" : theme == "light" ? "dark" : "auto" } label: {
            Icon(name: icon, size: 13, color: Kx.fgSecondary).frame(width: 14, height: 18)
        }
        .buttonStyle(.plain).hand()
        .help("Theme: \(theme)")
    }
}

/// The credit, a link — opened by hand, since SwiftUI's Link is inert in a non-activating panel.
struct Credit: View {
    @State private var hover = false
    var body: some View {
        Button { NSWorkspace.shared.open(URL(string: "https://milowda.com")!) } label: {
            Text("milowda").font(Kx.sans(11)).foregroundStyle(hover ? Kx.fgSecondary : Kx.fgFaint)
        }
        .buttonStyle(.plain).hand().onHover { hover = $0 }
    }
}

// The status bar's twin under settings: the theme where ⏻ was, the credit where it is.
struct SettingsBar: View {
    var body: some View {
        HStack(spacing: 8) {
            ThemeCycle()
            Spacer()
            Credit()
                .font(Kx.sans(11)).foregroundStyle(Kx.fgFaint)
        }
        .padding(.horizontal, 12).frame(height: 40)
    }
}

struct SettingsView: View {
    @EnvironmentObject var model: Model
    @AppStorage("notifications") private var notifications = true
    @State private var loginItem = SMAppService.mainApp.status == .enabled

    var body: some View {
        // One card, like a project card: every row the same height.
        VStack(spacing: 10) {
            Card {
                Row(icon: "power", title: "Launch at login", sub: "Kortext opens when you sign in.", on: loginItem) {
                    loginItem.toggle()
                    try? loginItem ? SMAppService.mainApp.register() : SMAppService.mainApp.unregister()
                }
                Row(icon: "bell", title: "Notify me", sub: "When a document waits on you.", on: notifications) {
                    notifications.toggle()
                    if notifications { model.ensureNotifications() }
                }
                // One row: the running version and whether its channel has a newer one; the
                // press installs it. Switching channels is the panel's status bar, not this.
                Row(icon: "arrow.down.circle", title: "Version",
                    sub: [model.version.map(pretty), model.status(model.channel)].compactMap { $0 }.joined(separator: " · ")) { model.pick(model.channel) }
                Row(icon: "ladybug", title: "Report an issue") {
                    var u = "https://github.com/erayendes/kortext/issues/new?template=bug_report.yml"
                    if let v = model.version { u += "&version=\(v)" }
                    NSWorkspace.shared.open(URL(string: u)!)
                }
                Row(icon: "heart", title: "Support Kortext") { NSWorkspace.shared.open(URL(string: "https://buymeacoffee.com/erayendes")!) }
                Row(icon: "xmark.circle", title: "Quit Kortext", trailing: "⌘Q") { NSApp.terminate(nil) }
            }
        }
        .padding(12)
    }
}

/// The project card's shell, for anything else that groups rows.
struct Card<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        VStack(spacing: 0) { content }
            .padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.regularMaterial))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
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
                    Text(title).font(Kx.sans(13)).foregroundStyle(Kx.fg).lineLimit(1)
                    if let sub { Text(sub).font(Kx.sans(11)).foregroundStyle(Kx.fgMuted).lineLimit(1) }
                }
                Spacer()
                if on == true { Icon(name: "checkmark", size: 11, color: Kx.fg, weight: .semibold) }
                if let trailing { Text(trailing).font(Kx.mono(10)).foregroundStyle(Kx.fgFaint) }
            }
            .padding(.horizontal, 14).frame(height: 46)
            .background(hover ? Kx.bgHover : .clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .hand()
        .onHover { hover = $0 }
    }
}

