import Foundation

// The menu bar app is a plain client of the kortext REST API (server/app.ts).
struct Health: Decodable { let version: String }
struct Project: Decodable, Identifiable {
    struct Counts: Decodable { let settled: Int; let total: Int }
    let id: Int; let name: String; let code: String; let docCounts: Counts
}
struct Job: Decodable { let id: Int; let doc_rel: String; let status: String; let error: String? }
struct Doc: Decodable { let rel: String; let status: String }
struct Readiness: Decodable { let ready: Bool; let questions: [String] }

enum Api {
    static let base = URL(string: "http://127.0.0.1:3441")!

    static func get<T: Decodable>(_ path: String, _ type: T.Type) async throws -> T {
        var req = URLRequest(url: base.appending(path: path))
        req.timeoutInterval = 3
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func health() async -> Health? { try? await get("/api/health", Health.self) }
    static func projects() async throws -> [Project] {
        struct R: Decodable { let projects: [Project] }
        return try await get("/api/projects", R.self).projects
    }
    static func jobs(_ id: Int) async throws -> (jobs: [Job], running: Job?) {
        struct R: Decodable { let jobs: [Job]; let running: Job? }
        let r = try await get("/api/projects/\(id)/jobs", R.self)
        return (r.jobs, r.running)
    }
    static func docs(_ id: Int) async throws -> [Doc] {
        struct R: Decodable { let docs: [Doc] }
        return try await get("/api/projects/\(id)/docs", R.self).docs
    }
    static func readiness(_ id: Int) async throws -> Readiness? {
        struct R: Decodable { let readiness: Readiness? }
        return try await get("/api/projects/\(id)/readiness", R.self).readiness
    }
}
