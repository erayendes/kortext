import AppKit
import UserNotifications

struct ProjectState: Identifiable {
    let project: Project
    var docs: [Doc] = []
    var drafts: [String] { docs.filter { $0.status == "draft" }.map(\.rel) }
    var running: Job? = nil
    var failed: Job? = nil         // most recent failed job, if the last job failed
    var notReady = false
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
        let project: ProjectState; let rel: String; let why: String
        var id: String { "\(project.id)/\(rel)" }
    }
    /// Every document that waits on the human: a draft to approve, a failed step, a brief with questions.
    var waiting: [Waiting] {
        projects.flatMap { p -> [Waiting] in
            var out: [Waiting] = []
            if p.notReady { out.append(Waiting(project: p, rel: "BRIEF.md", why: "questions to answer")) }
            for d in p.docs {
                if d.status == "draft" { out.append(Waiting(project: p, rel: d.rel, why: "awaiting approval")) }
                else if d.state == "failed" { out.append(Waiting(project: p, rel: d.rel, why: "failed")) }
            }
            return out
        }
    }
    var draftCount: Int { waiting.count }
    var anyRunning: Bool { projects.contains { $0.running != nil } }

    func start() {
        UNUserNotificationCenter.current().delegate = self
        installed = Shell.run("command -v kortext") != nil
        Task {
            _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge])
            // ponytail: KORTEXT_DEMO=1 fires the four sample notifications on launch — for screenshots, nothing else.
            if ProcessInfo.processInfo.environment["KORTEXT_DEMO"] != nil {
                notify("HYDRA", "LEGAL.md ready — awaiting approval")
                notify("HYDRA", "ARCHITECTURE.md could not be written", "claude: rate limit reached, retry after 60s")
                notify("MILO", "Brief too thin — answer the questions")
                notify("NORD", "Ready — AGENTS.md in force", "14 documents settled")
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
                if let last = j.jobs.first, last.status == "failed" { s.failed = last }
                for job in j.jobs.prefix(10) { observe(job, in: p) }
            }
            if let r = try? await Api.readiness(p.id) { s.notReady = !r.ready && !r.questions.isEmpty }
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
        case "done": notify(p.code, "\(job.doc_rel) ready — awaiting approval", project: p.id, doc: job.doc_rel)
        case "failed": notify(p.code, "\(job.doc_rel) could not be written", job.error?.split(separator: "\n").first.map(String.init), project: p.id, doc: job.doc_rel)
        default: break
        }
    }

    private func observeGate(_ s: ProjectState) {
        let id = s.id
        if s.notReady, !seenNotReady.contains(id) {
            seenNotReady.insert(id)
            if primed { notify(s.project.code, "Brief too thin — answer the questions", project: id, doc: "BRIEF.md") }
        } else if !s.notReady { seenNotReady.remove(id) }
        if s.complete, !seenComplete.contains(id) {
            seenComplete.insert(id)
            if primed { notify(s.project.code, "Ready — AGENTS.md in force", "\(s.project.docCounts.total) documents settled", project: id) }
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
            var s = ProjectState(project: Project(id: id, name: name, code: code, docCounts: .init(settled: 3, total: 15)))
            s.docs = docs; s.notReady = notReady; return s
        }
        return [
            p(90, "ACME", "Acme Billing", [Doc(rel: "PRODUCT.md", status: "draft", state: "waiting", detail: "approve"),
                                          Doc(rel: "STACK.md", status: "draft", state: "waiting", detail: "approve"),
                                          Doc(rel: "ARCHITECTURE.md", status: "uninitialized", state: "failed", detail: nil)]),
            p(91, "MILO", "Milowda", [], notReady: true),
        ]
    }()

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
