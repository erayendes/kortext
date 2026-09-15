import AppKit
import SwiftUI
import Combine

// The menu bar item and the panel under it. Not MenuBarExtra: that pins its
// window to the icon's left edge; this one opens centred beneath the icon,
// a little below the bar, the way a companion panel sits.
// A borderless panel refuses key status by default; without it Esc never arrives and resigning key (a click elsewhere) is never reported.
final class KeyPanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

@MainActor
final class StatusController: NSObject, NSWindowDelegate {
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let panel: KeyPanel
    private var bag = Set<AnyCancellable>()
    private var monitors: [Any] = []
    private var host: NSView!
    private var glass: NSVisualEffectView!

    init(model: Model, content: some View) {
        panel = KeyPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel, .fullSizeContentView], backing: .buffered, defer: true)
        super.init()
        panel.delegate = self
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .popUpMenu
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovable = false
        // Glass, as mimir does it: hudWindow's dark vibrant blur in dark, popover's in light; behind-window, so the desktop shows through.
        let glass = NSVisualEffectView()
        glass.material = NSApp.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? .hudWindow : .popover
        glass.blendingMode = .behindWindow
        glass.state = .active
        // The layer's cornerRadius clips the content, not the blur — its corners stay square and white.
        // A mask image clips the vibrancy itself; capInsets let one small image stretch to any size.
        let r: CGFloat = 12
        let mask = NSImage(size: NSSize(width: r * 2 + 1, height: r * 2 + 1), flipped: false) { rect in
            NSColor.black.setFill(); NSBezierPath(roundedRect: rect, xRadius: r, yRadius: r).fill(); return true
        }
        mask.capInsets = NSEdgeInsets(top: r, left: r, bottom: r, right: r)
        mask.resizingMode = .stretch
        glass.maskImage = mask
        glass.wantsLayer = true
        glass.layer?.cornerRadius = r
        glass.layer?.masksToBounds = true
        glass.layer?.borderWidth = 0.5
        glass.layer?.borderColor = NSColor.separatorColor.cgColor
        let host = NSHostingView(rootView: content)
        host.translatesAutoresizingMaskIntoConstraints = false
        glass.addSubview(host)
        NSLayoutConstraint.activate([
            host.leadingAnchor.constraint(equalTo: glass.leadingAnchor), host.trailingAnchor.constraint(equalTo: glass.trailingAnchor),
            host.topAnchor.constraint(equalTo: glass.topAnchor), host.bottomAnchor.constraint(equalTo: glass.bottomAnchor),
        ])
        self.host = host
        self.glass = glass
        panel.contentView = glass

        item.button?.image = NSImage(named: "menubar")
        item.button?.image?.isTemplate = true
        item.button?.imagePosition = .imageLeading
        item.button?.target = self
        item.button?.action = #selector(toggle)

        // The button follows the model: a count while something waits, dimmed while the server is down.
        model.objectWillChange.receive(on: DispatchQueue.main).sink { [weak self, weak model] _ in
            guard let self, let model else { return }
            DispatchQueue.main.async {
                self.item.button?.title = model.draftCount > 0 ? " \(model.draftCount)" : ""
                self.item.button?.alphaValue = model.version == nil ? 0.55 : 1
            }
        }.store(in: &bag)
    }

    @objc private func toggle() { panel.isVisible ? close() : open() }

    private func open() {
        guard let button = item.button, let win = button.window else { return }
        glass.material = NSApp.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? .hudWindow : .popover
        host.layoutSubtreeIfNeeded()
        let size = host.fittingSize
        let anchor = win.convertToScreen(button.convert(button.bounds, to: nil))
        var origin = NSPoint(x: anchor.midX - size.width / 2, y: anchor.minY - 8 - size.height)
        if let screen = win.screen ?? NSScreen.main {   // keep it on the screen the bar is on
            origin.x = min(max(origin.x, screen.visibleFrame.minX + 8), screen.visibleFrame.maxX - size.width - 8)
        }
        panel.setFrame(NSRect(origin: origin, size: size), display: true)
        panel.makeKeyAndOrderFront(nil)
        // Like a menu: a click anywhere else, or Esc, closes it.
        monitors = [
            NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in Task { @MainActor in self?.close() } } as Any,
            NSEvent.addLocalMonitorForEvents(matching: [.keyDown]) { [weak self] e in
                if e.keyCode == 53 { Task { @MainActor in self?.close() }; return nil }
                return e
            } as Any,
        ]
    }

    func windowDidResignKey(_ n: Notification) { close() }

    private func close() {
        panel.orderOut(nil)
        monitors.forEach { NSEvent.removeMonitor($0) }
        monitors = []
    }
}
