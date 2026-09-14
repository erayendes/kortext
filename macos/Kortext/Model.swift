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
    @Published var version: String? = nil      // nil = daemon down
    @Published var installed = true
    @Published var projects: [ProjectState] = []

    // Poll deltas — what was true last time, so a change becomes one notification.
    private var seenJobs: [Int: String] = [:]    // job id → status
    private var seenComplete: Set<Int> = []
    private var seenNotReady: Set<Int> = []
    private var primed = false                   // first poll only records, never notifies

    struct Waiting: Identifiable {
        enum Why { case approve, failed, questions(Int), writing }
        let project: ProjectState; let rel: String; let why: Why
        var id: String { "\(project.id)/\(rel)" }
    }
    /// Every document that waits on the human: a draft to approve, a failed step, a brief with questions.
    var waiting: [Waiting] {
        projects.flatMap { p -> [Waiting] in
            var out: [Waiting] = []
            if p.notReady { out.append(Waiting(project: p, rel: "BRIEF.md", why: .questions(p.questions))) }
            for d in p.docs {
                if d.status == "draft" { out.append(Waiting(project: p, rel: d.rel, why: .approve)) }
                else if d.state == "failed" { out.append(Waiting(project: p, rel: d.rel, why: .failed)) }
            }
            for j in p.writing { out.append(Waiting(project: p, rel: j.doc_rel, why: .writing)) }
            return out
        }
    }
    /// The badge counts decisions, not work in flight.
    var draftCount: Int { waiting.filter { if case .writing = $0.why { return false }; return true }.count }
    /// Projects with something to show: a row, a step in flight, or a pause to lift.
    var shown: [ProjectState] { projects.filter { p in waiting.contains { $0.project.id == p.id } || (p.project.paused ?? 0) == 1 && !p.complete } }
    var anyRunning: Bool { projects.contains { $0.running != nil } }
    var runningLine: (project: ProjectState, job: Job)? {
        for p in projects { if let j = p.running { return (p, j) } }
        return nil
    }
    func pause(_ p: ProjectState) { Task { try? await Api.post("/api/projects/\(p.id)/pause", ["paused": true]); await poll() } }
    /// A paused project with work left: Continue is the unpause, as on the panel.
    var pausedLine: ProjectState? { projects.first { ($0.project.paused ?? 0) == 1 && !$0.complete } }
    func resume(_ p: ProjectState) { Task { try? await Api.post("/api/projects/\(p.id)/pause", ["paused": false]); await poll() } }

    // Settings › Check for updates: the daemon knows both versions.
    @Published var update: String? = nil       // what the last check said
    var checkAppUpdate: () -> Void = {}
    /// The version pill: the app asks Sparkle about itself, the daemon about the npm package.
    func checkUpdates() {
        checkAppUpdate()
        if pendingUpdate { return applyUpdate() }
        update = "checking…"
        Task {
            guard let v = try? await Api.version() else { update = "v\(version ?? "") · offline"; return }
            pendingUpdate = v.stale
            update = v.stale ? "v\(v.latest ?? "") available · click to update" : "v\(v.current) · up to date"
        }
    }
    var pendingUpdate = false
    func applyUpdate() {
        update = "updating…"
        Task { try? await Api.post("/api/version/update"); pendingUpdate = false; update = "installed · restart the server" }
    }

    func start() {
        UNUserNotificationCenter.current().delegate = self
        installed = Shell.run("command -v kortext") != nil
        // Launched at login means the server is wanted too; a menu bar that says "not running" every morning is no companion.
        if installed, SMAppService.mainApp.status == .enabled {
            Task { if await Api.health() == nil { Shell.run("kortext --no-open") } }
        }
        Task {
            _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge])
            // ponytail: KORTEXT_DEMO=1 fires the four sample notifications on launch — for screenshots, nothing else.
            if ProcessInfo.processInfo.environment["KORTEXT_DEMO"] != nil {
                notify("HYDRA", "LEGAL.md hazır — onay bekliyor")
                notify("HYDRA", "ARCHITECTURE.md yazılamadı", "claude: rate limit reached, retry after 60s")
                notify("MILO", "Brief too thin — answer the questions")
                notify("NORD", "Hazır — AGENTS.md devrede", "14 belge onaylandı")
            }
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
        for p in list {
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
        // ponytail: KORTEXT_DEMO=1 adds two sample projects so the popover can be photographed with rows in it.
        if ProcessInfo.processInfo.environment["KORTEXT_DEMO"] != nil { next += Self.demo }
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

    static let demo: [ProjectState] = {
        func p(_ id: Int, _ code: String, _ name: String, _ docs: [Doc], notReady: Bool = false) -> ProjectState {
            var s = ProjectState(project: Project(id: id, name: name, code: code, docCounts: .init(settled: 3, total: 15), doc_lang: "Turkish", paused: 0))
            s.docs = docs; s.notReady = notReady; s.questions = 3; return s
        }
        return [
            p(90, "ACME", "Acme Billing", [Doc(rel: "PRODUCT.md", status: "draft", state: "waiting", detail: "approve"),
                                          Doc(rel: "STACK.md", status: "draft", state: "waiting", detail: "approve"),
                                          Doc(rel: "ARCHITECTURE.md", status: "uninitialized", state: "failed", detail: nil)]),
            p(91, "MILO", "Milowda", [], notReady: true),
        ]
    }()

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

    func startDaemon() { Shell.run("kortext --no-open"); Task { try? await Task.sleep(for: .seconds(2)); await poll() } }
    /// ⏻: the server goes down with the app. A running step refuses (--stop does), so the app stays and says so.
    func quitAll() {
        Task {
            Shell.run("kortext --stop")
            if await Api.health() == nil { NSApp.terminate(nil) } else { await poll() }
        }
    }
    func stopDaemon() { Shell.run("kortext --stop"); Task { await poll() } }
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
