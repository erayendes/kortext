import AppKit
import UserNotifications
import ServiceManagement

struct ProjectState: Identifiable {
    let project: Project
    var docs: [Doc] = []
    var drafts: [String] { docs.filter { $0.status == "draft" }.map(\.rel) }
    var running: Job? = nil
    var writing: [Job] = []          // every step in flight
    var failed: Job? = nil         // most recent failed job, if the last job failed
    var notReady = false
    var questions = 0
    var id: Int { project.id }
    var complete: Bool { project.docCounts.total > 0 && project.docCounts.settled == project.docCounts.total }
}

@MainActor
final class Model: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    @Published var version: String? = nil {     // nil = daemon down
        didSet { UserDefaults.standard.set(channel == "beta", forKey: "beta") }  // Sparkle follows the server's channel
    }
    @Published var installed = true
    /// "starting" | "stopping": the press was taken and health has not answered yet — ⏻ and the card wait, disabled.
    @Published var busy: String? = nil
    @Published var projects: [ProjectState] = []

    // Poll deltas — what was true last time, so a change becomes one notification.
    private var seenJobs: [Int: String] = [:]    // job id → status
    private var seenComplete: Set<Int> = []
    private var seenNotReady: Set<Int> = []
    private var primed = false                   // first poll only records, never notifies

    /// One row per document the panel would list under Action needed or Doing,
    /// with the panel's own section, state and detail — the server decides all three.
    struct Waiting: Identifiable {
        let project: ProjectState; let doc: Doc
        var id: String { "\(project.id)/\(doc.rel)" }
        var needs: Bool { doc.section == "needs" }
    }
    var waiting: [Waiting] {
        projects.flatMap { p -> [Waiting] in
            var out: [Waiting] = []
            // A brief the gate sent back: the panel shows its questions as a card; here it is a review row.
            if p.notReady { out.append(Waiting(project: p, doc: Doc(rel: "BRIEF.md", status: "approved", state: "waiting", detail: "review", section: "needs"))) }
            out += p.docs.filter { $0.section == "needs" }.map { Waiting(project: p, doc: $0) }
            out += p.docs.filter { $0.section == "doing" }.map { Waiting(project: p, doc: $0) }
            return out
        }
    }
    /// The badge counts decisions, not work in flight.
    var draftCount: Int { waiting.filter(\.needs).count }
    /// Projects with something to show: a row, a step in flight, or a chain that settled and was not archived.
    var shown: [ProjectState] { projects.filter { p in p.complete || waiting.contains { $0.project.id == p.id } } }
    var anyRunning: Bool { projects.contains { $0.running != nil } }
    var runningLine: (project: ProjectState, job: Job)? {
        for p in projects { if let j = p.running { return (p, j) } }
        return nil
    }


    // Two rows, one Kortext: stable and beta, each showing its newest and whether that is
    // what runs here. Pressing one installs it (npm follows the tag, downgrades included) and
    // restarts the server; Sparkle then brings the app to the same channel.
    @Published var tags: [String: String] = [:]   // npm dist-tags: latest, beta
    @Published var note: String? = nil            // what the pressed row is doing
    @Published var pressed: String? = nil         // "latest" | "beta"
    var checkAppUpdate: () -> Void = {}
    var channel: String { (version ?? "").contains("-") ? "beta" : "latest" }

    func status(_ tag: String) -> String {
        if pressed == tag, let n = note { return n }
        guard let want = tags[tag] else { return tags.isEmpty ? "…" : "No beta version right now" }
        return version == want ? "up to date" : tag == channel ? "update available" : "not installed"
    }

    /// Only a 3.2+ server knows the `tag` field; an older one always installs the release.
    var serverSwitches: Bool {
        let p = (version ?? "0").split(separator: ".").compactMap { Int($0.prefix { $0.isNumber }) }
        return p.count >= 2 && (p[0] > 3 || (p[0] == 3 && p[1] >= 2))
    }

    func loadTags() { Task { tags = await Api.distTags() } }

    func pick(_ tag: String) {
        pressed = tag; note = "checking…"
        Task {
            tags = await Api.distTags()
            guard let want = tags[tag] else { note = tags.isEmpty ? "could not reach npm" : nil; return }
            if version == want { checkAppUpdate(); note = nil; return }
            if await Task.detached { Shell.run("kortext --version") }.value?.trimmingCharacters(in: .whitespacesAndNewlines) == want { await restart(); return }   // installed by hand, not yet running
            if tag == "beta", !serverSwitches {
                // The first beta is installed by hand; from then on the server can switch itself.
                NSPasteboard.general.clearContents(); NSPasteboard.general.setString("npm i -g kortext@beta", forType: .string)
                note = "copied npm i -g kortext@beta — run it, then press again"
                return
            }
            install(tag: tag, to: want)
        }
    }

    /// Stop and start the server, then wait for `/api/health` to answer with the new version.
    func restart() async {
        note = "restarting…"
        await Task.detached { Shell.run("kortext --stop"); Shell.run("kortext --no-open") }.value
        for _ in 0..<20 {
            try? await Task.sleep(for: .seconds(1))
            if let h = await Api.health() { version = h.version; note = nil; checkAppUpdate(); await poll(); return }
        }
        note = "installed · press ⏻"
    }

    /// Install, then restart the server ourselves: the process on the port is still the old
    /// one until it goes down and comes back. A refused install (a step running) says so.
    func install(tag: String, to want: String) {
        note = "installing \(pretty(want))…"
        Task {
            guard (try? await Api.post("/api/version/update", ["tag": tag])) == true else { note = "not now — a step is running"; return }
            await restart()
        }
    }

    func start() {
        loadTags()
        UNUserNotificationCenter.current().delegate = self
        installed = Shell.run("command -v kortext") != nil
        // Opening the app means the server is wanted; a menu bar that says "not running" is no companion.
        // The server comes up quietly — the panel is a press away, not a browser window that opens itself.
        if installed {
            Task { if await Api.health() == nil { startDaemon() } }
        }
        Task {
            _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge])
        }
        Task {
            while true {
                await poll()
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }

    func poll() async {
        guard let h = await Api.health() else { version = nil; projects = []; return }
        version = h.version
        guard let list = try? await Api.projects() else { return }
        var next: [ProjectState] = []
        for p in list where p.archived != 1 {   // folded away in the panel; folded away here too
            var s = ProjectState(project: p)
            if let d = try? await Api.docs(p.id) { s.docs = d }
            if let j = try? await Api.jobs(p.id) {
                s.running = j.running
                s.writing = j.jobs.filter { $0.status == "running" }
                if let last = j.jobs.first, last.status == "failed" { s.failed = last }
                for job in j.jobs.prefix(10) { observe(job, in: p) }
            }
            if let r = try? await Api.readiness(p.id) { s.notReady = !r.ready && !r.questions.isEmpty; s.questions = r.questions.count }
            observeGate(s)
            next.append(s)
        }
        projects = next
        primed = true
    }

    private func observe(_ job: Job, in p: Project) {
        let was = seenJobs[job.id]
        seenJobs[job.id] = job.status
        guard primed, was == "running", job.status != "running" else { return }
        switch job.status {
        case "done": notify(p.code, p.tr ? "\(job.doc_rel) hazır — onay bekliyor" : "\(job.doc_rel) ready — awaiting approval", project: p.id, doc: job.doc_rel)
        case "failed": notify(p.code, p.tr ? "\(job.doc_rel) yazılamadı" : "\(job.doc_rel) could not be written", job.error?.split(separator: "\n").first.map(String.init), project: p.id, doc: job.doc_rel)
        default: break
        }
    }

    private func observeGate(_ s: ProjectState) {
        let id = s.id
        if s.notReady, !seenNotReady.contains(id) {
            seenNotReady.insert(id)
            if primed { notify(s.project.code, s.project.tr ? "Brief yetersiz — soruları yanıtla" : "Brief too thin — answer the questions", project: id, doc: "BRIEF.md") }
        } else if !s.notReady { seenNotReady.remove(id) }
        if s.complete, !seenComplete.contains(id) {
            seenComplete.insert(id)
            if primed { notify(s.project.code, s.project.tr ? "Hazır — AGENTS.md devrede" : "Ready — AGENTS.md in force", s.project.tr ? "\(s.project.docCounts.total) belge onaylandı" : "\(s.project.docCounts.total) documents settled", project: id) }
        } else if !s.complete { seenComplete.remove(id) }
    }

    // Show the banner even when this app counts as frontmost (it has no window to be behind).
    nonisolated func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification) async -> UNNotificationPresentationOptions { [.banner, .list] }
    nonisolated func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse) async {
        let info = r.notification.request.content.userInfo
        await MainActor.run { openPanel(project: info["project"] as? Int, doc: info["doc"] as? String) }
    }

    /// Settings › notifications: ask if never asked; if refused, the only fix is System Settings.
    func ensureNotifications() {
        Task {
            let st = await UNUserNotificationCenter.current().notificationSettings()
            switch st.authorizationStatus {
            case .notDetermined: _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge])
            case .denied: NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension")!)
            default: break
            }
        }
    }

    func notify(_ title: String, _ body: String, _ subtitle: String? = nil, project: Int? = nil, doc: String? = nil) {
        guard UserDefaults.standard.object(forKey: "notifications") as? Bool ?? true else { return }
        let c = UNMutableNotificationContent()
        c.title = title; c.body = body
        if let subtitle { c.subtitle = subtitle }
        if let project { c.userInfo["project"] = project }
        if let doc { c.userInfo["doc"] = doc }
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
    }

    /// ⏻: start the server; the panel is a press away, not a browser window that opens itself.
    func startDaemon() { transition("starting", "kortext --no-open") { $0 != nil } }
    /// ⏻: stop the server; the app stays, dimmed, a press away from starting it again.
    func stopDaemon() { transition("stopping", "kortext --stop") { $0 == nil } }
    /// Say what is happening at once, run the command off the main thread, then poll until health agrees (20 s at most).
    private func transition(_ what: String, _ cmd: String, until done: @escaping (String?) -> Bool) {
        guard busy == nil else { return }
        busy = what
        Task {
            await Task.detached { Shell.run(cmd) }.value
            for _ in 0..<20 {
                await poll()
                if done(version) { break }
                try? await Task.sleep(for: .seconds(1))
            }
            busy = nil
        }
    }
    func openPanel(_ p: ProjectState? = nil, _ doc: Doc? = nil) { openPanel(project: p?.id, doc: doc?.rel) }
    func openPanel(project: Int?, doc: String?) {
        var c = URLComponents(url: Api.base, resolvingAgainstBaseURL: false)!
        if let project {
            c.queryItems = [URLQueryItem(name: "project", value: String(project))]
            if let doc { c.queryItems?.append(URLQueryItem(name: "doc", value: doc)) }
        }
        NSWorkspace.shared.open(c.url!)
    }
}

enum Shell {
    // A GUI app's PATH does not know npm's global bin. A login shell reads .zprofile
    // (Homebrew); an interactive one also reads .zshrc, where nvm, fnm and volta live.
    @discardableResult
    static func run(_ cmd: String) -> String? {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/zsh")
        p.arguments = ["-lic", cmd]
        let out = Pipe(); p.standardOutput = out; p.standardError = FileHandle.nullDevice
        p.standardInput = FileHandle.nullDevice
        try? p.run(); p.waitUntilExit()
        guard p.terminationStatus == 0 else { return nil }
        return String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)
    }
}

extension Project {
    /// The documents are written in this language; so is the nudge about them.
    var tr: Bool { (doc_lang ?? "").lowercased().hasPrefix("tur") || (doc_lang ?? "").lowercased().hasPrefix("türk") }
}

/// `3.2.0-beta.2` reads as `3.2-beta2`, `3.2.0` as `3.2`, `3.1.2` stays: the patch only when it says something.
func pretty(_ v: String) -> String {
    let base = String(v.prefix { $0 != "-" }); let pre = v.dropFirst(base.count).dropFirst()
    var parts = base.split(separator: ".").map(String.init)
    if parts.count == 3, parts[2] == "0" { parts.removeLast() }
    let short = parts.joined(separator: ".")
    return pre.isEmpty ? short : short + "-" + pre.replacingOccurrences(of: ".", with: "")
}
/// The app's own version, as the bundle carries it.
var appVersion: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0" }
