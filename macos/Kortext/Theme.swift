import SwiftUI

// The panel's tokens (ui/src/index.css, DESIGN.md §2–3), resolved per appearance.
enum Kx {
    private static func dyn(_ light: String, _ dark: String) -> Color {
        Color(nsColor: NSColor(name: nil) { app in
            app.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? NSColor(hex: dark) : NSColor(hex: light)
        })
    }
    static let bg = dyn("#ffffff", "#0a0a0b")
    static let bgSubtle = dyn("#fbfbfc", "#0e0e10")
    static let bgHover = dyn("#f2f2f4", "#1a1a1d")
    static let bgActive = dyn("#ececef", "#212126")
    static let border = dyn("#eaeaec", "#2a2a30")
    static let borderStrong = dyn("#dcdce0", "#3a3a42")
    static let fg = dyn("#18181b", "#ededef")
    static let fgSecondary = dyn("#51515a", "#9c9ca5")
    static let fgMuted = dyn("#76767f", "#6e6e77")
    static let fgFaint = dyn("#a3a3ad", "#54545c")
    static let accent = dyn("#18181b", "#ededef")
    static let accentFg = dyn("#ffffff", "#0a0a0b")
    static let green = dyn("#157a52", "#46c08a")
    static let amber = dyn("#9a6a16", "#d3a55e"), amberBg = dyn("#faf2e2", "#241c0e"), amberBorder = dyn("#ecdcb8", "#3a2e16")
    static let red = dyn("#c5392f", "#e0726a"), redBg = dyn("#fbeceb", "#26120f"), redBorder = dyn("#f1cfcc", "#3d201c")
    static let violet = dyn("#5b4bcc", "#8b7df0"), violetBg = dyn("#efedfb", "#17142a"), violetBorder = dyn("#d6d1f3", "#2c2650")

    // Barlow for what a human reads, Overpass Mono for what the machine owns.
    static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .custom("Barlow", size: size).weight(weight) }
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .custom("Overpass Mono", size: size).weight(weight) }
}

extension NSColor {
    convenience init(hex: String) {
        var v: UInt64 = 0
        Scanner(string: String(hex.dropFirst())).scanHexInt64(&v)
        self.init(red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
    }
}

/// A Lucide glyph from the asset catalog, stroke-colored.
struct Icon: View {
    let name: String
    var size: CGFloat = 14
    var color: Color = Kx.fgMuted
    var body: some View {
        Image(name).resizable().renderingMode(.template).frame(width: size, height: size).foregroundStyle(color)
    }
}

/// The panel's state pill: text, tint, border — a closed set of three meanings here.
struct Pill: View {
    enum Kind { case approve, failed, questions }
    let kind: Kind; let text: String
    var body: some View {
        let c: (Color, Color, Color) = switch kind {
        case .approve: (Kx.violet, Kx.violetBg, Kx.violetBorder)
        case .failed: (Kx.red, Kx.redBg, Kx.redBorder)
        case .questions: (Kx.amber, Kx.amberBg, Kx.amberBorder)
        }
        Text(text).font(Kx.sans(12, .medium)).foregroundStyle(c.0)
            .padding(.horizontal, 8).frame(height: 20)
            .background(c.1).overlay(Capsule().stroke(c.2, lineWidth: 1)).clipShape(Capsule())
    }
}
