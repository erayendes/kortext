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
    static let accent = Color.accentColor
    static let accentFg = Color.white
    // The panel's state colours — quieter than the system's, and dark enough to read on a light ground.
    private static func dyn(_ light: String, _ dark: String) -> Color {
        Color(nsColor: NSColor(name: nil) { $0.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? NSColor(hex: dark) : NSColor(hex: light) })
    }
    static let green = dyn("#157a52", "#46c08a")
    static let red = dyn("#c5392f", "#e0726a")
    static let amber = dyn("#9a6a16", "#d3a55e")
    static let violet = dyn("#5b4bcc", "#8b7df0")
    static let blue = dyn("#2563c9", "#5e9bf0")
    static let pink = dyn("#c02a72", "#ee7bb0")

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

/// The panel's badge: a detail (what is owed) or a state (what is happening), in the panel's colours.
struct Pill: View {
    enum Kind { case detail(String), state(String) }
    let kind: Kind; let text: String
    var body: some View {
        let c: Color = switch kind {
        case .detail("approve"): Kx.violet
        case .detail("review"): Kx.pink
        case .detail("recheck"): Kx.amber
        case .state("failed"): Kx.red
        case .state("writing"), .state("reading"): Kx.blue
        case .state("paused"): Kx.amber
        default: Kx.fgSecondary
        }
        Text(text).font(Kx.sans(11, .medium)).foregroundStyle(c)
            .padding(.horizontal, 8).frame(height: 20)
            .background(c.opacity(0.09)).clipShape(Capsule())
    }
}


extension NSColor {
    convenience init(hex: String) {
        var v: UInt64 = 0
        Scanner(string: String(hex.dropFirst())).scanHexInt64(&v)
        self.init(red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
    }
}

/// Everything pressable shows the hand.
extension View {
    func hand() -> some View { onHover { if $0 { NSCursor.pointingHand.push() } else { NSCursor.pop() } } }
}
