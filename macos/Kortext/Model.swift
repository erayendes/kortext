import AppKit
import UserNotifications

struct ProjectState: Identifiable {
    let project: Project
    var drafts: [String] = []      // doc rels with status draft
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

    var draftCount: Int { projects.reduce(0) { $0 + $1.drafts.count } }
    var anyRunning: Bool { projects.contains { $0.running != nil } }

    func start() {
        UNUserNotificationCenter.current().delegate = self
        installed = Shell.run("command -v kortext") != nil
        Task {
            _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge])
            // ponytail: KORTEXT_DEMO_NOTIFY=1 fires the four sample notifications on launch — for screenshots, nothing else.
            if ProcessInfo.processInfo.environment["KORTEXT_DEMO_NOTIFY"] != nil {
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
            if let d = try? await Api.docs(p.id) { s.drafts = d.filter { $0.status == "draft" }.map(\.rel) }
            if let j = try? await Api.jobs(p.id) {
                s.running = j.running
                if let last = j.jobs.first, last.status == "failed" { s.failed = last }
                for job in j.jobs.prefix(10) { observe(job, in: p) }
            }
            if let r = try? await Api.readiness(p.id) { s.notReady = !r.ready && !r.questions.isEmpty }
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
        case "done": notify(p.code, "\(job.doc_rel) ready — awaiting approval")
        case "failed": notify(p.code, "\(job.doc_rel) could not be written", job.error?.split(separator: "\n").first.map(String.init))
        default: break
        }
    }

    private func observeGate(_ s: ProjectState) {
        let id = s.id
        if s.notReady, !seenNotReady.contains(id) {
            seenNotReady.insert(id)
            if primed { notify(s.project.code, "Brief too thin — answer the questions") }
        } else if !s.notReady { seenNotReady.remove(id) }
        if s.complete, !seenComplete.contains(id) {
            seenComplete.insert(id)
            if primed { notify(s.project.code, "Ready — AGENTS.md in force", "\(s.project.docCounts.total) documents settled") }
        } else if !s.complete { seenComplete.remove(id) }
    }

    // Show the banner even when this app counts as frontmost (it has no window to be behind).
    nonisolated func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification) async -> UNNotificationPresentationOptions { [.banner, .list] }
    nonisolated func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse) async {
        await MainActor.run { NSWorkspace.shared.open(Api.base) }
    }

    func notify(_ title: String, _ body: String, _ subtitle: String? = nil) {
        let c = UNMutableNotificationContent()
        c.title = title; c.body = body
        if let subtitle { c.subtitle = subtitle }
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
    }

    func startDaemon() { Shell.run("kortext --no-open"); Task { try? await Task.sleep(for: .seconds(2)); await poll() } }
    func stopDaemon() { Shell.run("kortext --stop"); Task { await poll() } }
    func openPanel() { NSWorkspace.shared.open(Api.base) }
}

enum Shell {
    // A GUI app's PATH does not know npm's global bin; a login shell does.
    @discardableResult
    static func run(_ cmd: String) -> String? {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/zsh")
        p.arguments = ["-lc", cmd]
        let out = Pipe(); p.standardOutput = out; p.standardError = FileHandle.nullDevice
        try? p.run(); p.waitUntilExit()
        guard p.terminationStatus == 0 else { return nil }
        return String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)
    }
}
