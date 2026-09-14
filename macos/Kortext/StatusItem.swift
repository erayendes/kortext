import AppKit
import SwiftUI
import Combine

// The menu bar item and the panel under it. Not MenuBarExtra: that pins its
// window to the icon's left edge; this one opens centred beneath the icon,
// a little below the bar, the way a companion panel sits.
@MainActor
final class StatusController: NSObject {
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let panel: NSPanel
    private var bag = Set<AnyCancellable>()
    private var monitors: [Any] = []
    private var host: NSView!

    init(model: Model, content: some View) {
        panel = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel, .fullSizeContentView], backing: .buffered, defer: true)
        super.init()
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .popUpMenu
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovable = false
        // Glass: the system's popover material behind clear SwiftUI content.
        let glass = NSVisualEffectView()
        glass.material = .popover
        glass.blendingMode = .behindWindow
        glass.state = .active
        glass.wantsLayer = true
        glass.layer?.cornerRadius = 12
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
        host.layoutSubtreeIfNeeded()
        let size = host.fittingSize
        let anchor = win.convertToScreen(button.convert(button.bounds, to: nil))
        var origin = NSPoint(x: anchor.midX - size.width / 2, y: anchor.minY - 8 - size.height)
        if let screen = win.screen ?? NSScreen.main {   // keep it on the screen the bar is on
            origin.x = min(max(origin.x, screen.visibleFrame.minX + 8), screen.visibleFrame.maxX - size.width - 8)
        }
        panel.setFrame(NSRect(origin: origin, size: size), display: true)
        panel.orderFrontRegardless()
        panel.makeKey()
        // Any click outside closes it, like a menu.
        monitors = [
            NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in self?.close() } as Any,
            NSEvent.addLocalMonitorForEvents(matching: [.keyDown]) { [weak self] e in
                if e.keyCode == 53 { self?.close(); return nil }   // esc
                return e
            } as Any,
        ]
    }

    private func close() {
        panel.orderOut(nil)
        monitors.forEach { NSEvent.removeMonitor($0) }
        monitors = []
    }
}
