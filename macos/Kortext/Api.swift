import Foundation

// The menu bar app is a plain client of the kortext REST API (server/app.ts).
struct Health: Decodable { let version: String }
struct Project: Decodable, Identifiable {
    struct Counts: Decodable { let settled: Int; let total: Int }
    let id: Int; let name: String; let code: String; let docCounts: Counts
}
struct Job: Decodable { let id: Int; let doc_rel: String; let status: String; let error: String? }
struct Doc: Decodable, Identifiable {
    let rel: String; let status: String; let state: String; let detail: String?
    var id: String { rel }
}
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
    /// Approve needs the version the panel would have read; fetch it, then post.
    static func approve(_ id: Int, rel: String) async throws {
        struct C: Decodable { let version: String }
        let v = try await get("/api/projects/\(id)/docs/content?rel=\(rel)", C.self).version
        var req = URLRequest(url: base.appending(path: "/api/projects/\(id)/docs/approve"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["rel": rel, "expectedVersion": v])
        let (data, resp) = try await URLSession.shared.data(for: req)
        if (resp as? HTTPURLResponse)?.statusCode != 200 {
            struct E: Decodable { let error: String }
            throw ApiError((try? JSONDecoder().decode(E.self, from: data).error) ?? "approve failed")
        }
    }

    static func readiness(_ id: Int) async throws -> Readiness? {
        struct R: Decodable { let readiness: Readiness? }
        return try await get("/api/projects/\(id)/readiness", R.self).readiness
    }
}

struct ApiError: LocalizedError { let msg: String; init(_ m: String) { msg = m }; var errorDescription: String? { msg } }
