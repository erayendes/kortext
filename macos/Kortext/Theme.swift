import SwiftUI

// Native macOS: system type, system colours, SF Symbols. The panel's state
// colours keep their meaning (violet = approve, red = failed, amber = your
// turn) but come from the system palette, so they sit right on glass.
enum Kx {
    static let fg = Color.primary
    static let fgSecondary = Color.secondary
    static let fgMuted = Color.secondary
    static let fgFaint = Color(nsColor: .tertiaryLabelColor)
    static let border = Color.primary.opacity(0.08)
    static let borderStrong = Color.primary.opacity(0.16)
    static let bgHover = Color.primary.opacity(0.06)
    static let bgActive = Color.primary.opacity(0.10)
    static let card = Color.primary.opacity(0.035)
    static let accent = Color.accentColor
    static let accentFg = Color.white
    static let green = Color(nsColor: .systemGreen)
    static let red = Color(nsColor: .systemRed)
    static let amber = Color(nsColor: .systemOrange)
    static let violet = Color(nsColor: .systemPurple)

    static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight) }
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight, design: .monospaced) }
}

/// An SF Symbol at a fixed point size, coloured.
struct Icon: View {
    let name: String
    var size: CGFloat = 13
    var color: Color = Kx.fgMuted
    var weight: Font.Weight = .medium
    var body: some View {
        Image(systemName: name).font(.system(size: size, weight: weight)).foregroundStyle(color)
    }
}

/// A tinted capsule: the state and its word.
struct Pill: View {
    enum Kind { case approve, failed, questions }
    let kind: Kind; let text: String
    var body: some View {
        let c: Color = switch kind { case .approve: Kx.violet; case .failed: Kx.red; case .questions: Kx.amber }
        Text(text).font(Kx.sans(11, .semibold)).foregroundStyle(c)
            .padding(.horizontal, 8).frame(height: 20)
            .background(c.opacity(0.14)).clipShape(Capsule())
    }
}
