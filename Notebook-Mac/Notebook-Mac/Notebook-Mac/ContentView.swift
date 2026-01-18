//
//  ContentView.swift
//  Notebook-Mac
//
//  Created by 可鑫 on 2025/12/31.
//

import SwiftUI
import WebKit
import Foundation
import AppKit

struct WebView: NSViewRepresentable {
    let fileName: String
    @ObservedObject var coordinator: Coordinator
    
    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.preferences.setValue(true, forKey: "developerExtrasEnabled")
        configuration.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        
        // Add message handlers
        configuration.userContentController.add(context.coordinator, name: "shareHandler")
        configuration.userContentController.add(context.coordinator, name: "titleHandler")
        
        print("[WebView] makeNSView: Message handlers registered")
        
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        
        return webView
    }
    
    func updateNSView(_ nsView: WKWebView, context: Context) {
        if coordinator.loadedFileName != fileName {
            if let url = Bundle.main.url(forResource: fileName, withExtension: "html") {
                nsView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
                DispatchQueue.main.async {
                    coordinator.loadedFileName = fileName
                }
            }
        }
        
        // Handle external commands from SwiftUI toolbar
        if let command = coordinator.pendingCommand {
            print("Executing JS Command: \(command)")
            nsView.evaluateJavaScript(command) { (result, error) in
                if let error = error {
                    print("JS Error: \(error.localizedDescription)")
                }
            }
            DispatchQueue.main.async {
                coordinator.pendingCommand = nil
            }
        }
    }
    
    func makeCoordinator() -> Coordinator {
        coordinator
    }
    
    class Coordinator: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate {
        @Published var pendingCommand: String?
        @Published var loadedFileName: String? = nil
        var onShare: ((String) -> Void)?
        var onTitleChange: ((String) -> Void)?
        private var titleObservation: NSKeyValueObservation?
        
        func observeTitle(of webView: WKWebView) {
            titleObservation = webView.observe(\.title, options: [.new]) { [weak self] webView, change in
                if let newTitle = change.newValue as? String, !newTitle.isEmpty {
                    print("[WebView.Coordinator] KVO title changed: \(newTitle)")
                    DispatchQueue.main.async {
                        self?.onTitleChange?(newTitle)
                    }
                }
            }
            print("[WebView.Coordinator] KVO title observation started")
        }
        
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            print("[WebView.Coordinator] Received message: \(message.name)")
            if message.name == "shareHandler", let content = message.body as? String {
                print("[WebView.Coordinator] Share content: \(content.prefix(50))...")
                onShare?(content)
            } else if message.name == "titleHandler", let title = message.body as? String {
                print("[WebView.Coordinator] Title update: \(title)")
                onTitleChange?(title)
            }
        }
        
        // WKNavigationDelegate - 追踪页面加载的所有阶段
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            print("[WebView.Coordinator] didStartProvisionalNavigation")
        }
        
        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            print("[WebView.Coordinator] didCommit - HTML started loading")
        }
        
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            print("[WebView.Coordinator] didFinish - Page fully loaded")
            
            // 启动 KVO 观察 webView.title 变化
            observeTitle(of: webView)
        }
        
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            print("[WebView.Coordinator] ❌ didFail: \(error.localizedDescription)")
        }
        
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            print("[WebView.Coordinator] ❌ didFailProvisionalNavigation: \(error.localizedDescription)")
        }
    }
}

// 用于可靠捕捉窗口的辅助视图
struct WindowAccessor: NSViewRepresentable {
    var onWindowFound: (NSWindow) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            if let window = view.window {
                onWindowFound(window)
            }
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

struct ViewAccessor: NSViewRepresentable {
    var onViewFound: (NSView) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            onViewFound(view)
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

struct ShareToolbarButton: NSViewRepresentable {
    var onClick: () -> Void
    var onViewReady: (NSButton) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onClick: onClick)
    }

    func makeNSView(context: Context) -> NSButton {
        let image = NSImage(systemSymbolName: "square.and.arrow.up", accessibilityDescription: nil)
        image?.isTemplate = true

        let button = NSButton(image: image ?? NSImage(), target: context.coordinator, action: #selector(Coordinator.handleClick))
        button.bezelStyle = .texturedRounded
        button.imagePosition = .imageOnly
        button.title = ""
        button.toolTip = "分享"

        DispatchQueue.main.async {
            onViewReady(button)
        }

        return button
    }

    func updateNSView(_ nsView: NSButton, context: Context) {}

    final class Coordinator: NSObject {
        private let onClick: () -> Void

        init(onClick: @escaping () -> Void) {
            self.onClick = onClick
        }

        @objc func handleClick() {
            onClick()
        }
    }
}

struct StandaloneEditorView: View {
    var body: some View {
        ContentView(isMain: false, defaultSelection: "note-window")
    }
}

struct ContentView: View {
    var isMain: Bool = true
    var defaultSelection: String = "index"
    @State private var selection: String?
    @StateObject private var webViewCoordinator = WebView.Coordinator()
    @State private var windowTitle: String = "RI 笔记"
    @State private var currentWindow: NSWindow?
    @State private var shareContent: String? = nil
    @State private var shareButton: NSButton? = nil
    @EnvironmentObject var appDelegate: AppDelegate
    
    init(isMain: Bool = true, defaultSelection: String = "index") {
        self.isMain = isMain
        self.defaultSelection = defaultSelection
        self._selection = State(initialValue: defaultSelection)
    }
    
    var body: some View {
        NavigationSplitView {
            List(selection: $selection) {
                NavigationLink(value: "index") {
                    Label("主页", systemImage: "house")
                }
                NavigationLink(value: "note-window") {
                    Label("笔记编辑器", systemImage: "pencil.and.outline")
                }
            }
            .listStyle(.sidebar)
            .navigationTitle(windowTitle)
            .background(WindowAccessor { window in
                print("[WindowAccessor] Captured window: \(window)")
                self.currentWindow = window
                print("[WindowAccessor] Calling setupWindow with isMain: \(isMain)")
                appDelegate.setupWindow(window, isMain: isMain)
            })
        } detail: {
            if let selection = selection {
                WebView(fileName: selection, coordinator: webViewCoordinator)
                    .ignoresSafeArea()
                    .onAppear {
                        webViewCoordinator.onShare = { content in
                            self.shareContent = content
                            showSharePicker(content: content)
                        }
                        
                        webViewCoordinator.onTitleChange = { newTitle in
                            print("[ContentView] Title change callback: \(newTitle)")
                            self.windowTitle = newTitle
                            if let window = self.currentWindow {
                                print("[ContentView] Updating window title to: \(newTitle)")
                                window.title = newTitle
                            } else {
                                print("[ContentView] WARNING: currentWindow is nil")
                            }
                        }
                    }
                    .toolbar {
                        ToolbarItemGroup(placement: .primaryAction) {
                            if selection == "note-window" {
                                ShareToolbarButton(
                                    onClick: {
                                        webViewCoordinator.pendingCommand = "window.webkit.messageHandlers.shareHandler.postMessage(document.getElementById('md-editor').innerText)"
                                    },
                                    onViewReady: { button in
                                        self.shareButton = button
                                    }
                                )
                                
                                Button(action: {
                                    webViewCoordinator.pendingCommand = "toggleModeDropdown()"
                                }) {
                                    Label("切换模式", systemImage: "list.bullet.indent")
                                }
                            } else if selection == "index" {
                                Button(action: {
                                    webViewCoordinator.pendingCommand = "document.getElementById('add-mode-btn').click()"
                                }) {
                                    Label("添加模式", systemImage: "plus")
                                }
                                
                                Button(action: {
                                    webViewCoordinator.pendingCommand = "document.getElementById('all-history-btn').click()"
                                }) {
                                    Label("历史记录", systemImage: "clock")
                                }
                                
                                Divider()
                                
                                Button(action: {
                                    webViewCoordinator.pendingCommand = "document.getElementById('import-btn').click()"
                                }) {
                                    Label("导入", systemImage: "square.and.arrow.down")
                                }
                                
                                Button(action: {
                                    webViewCoordinator.pendingCommand = "document.getElementById('export-btn').click()"
                                }) {
                                    Label("导出", systemImage: "square.and.arrow.up")
                                }
                            }
                        }
                    }
            } else {
                Text("选择一个页面开始")
                    .foregroundColor(.secondary)
            }
        }
    }
    
    private func showSharePicker(content: String) {
        // 创建临时文件以增强 AirDrop 兼容性
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent("Note.txt")

        func show(_ picker: NSSharingServicePicker) {
            DispatchQueue.main.async {
                if let button = shareButton {
                    picker.show(relativeTo: button.bounds, of: button, preferredEdge: .maxY)
                } else if let window = NSApp.keyWindow, let contentView = window.contentView {
                    let rect = NSRect(x: contentView.bounds.maxX - 50, y: contentView.bounds.maxY - 40, width: 0, height: 0)
                    picker.show(relativeTo: rect, of: contentView, preferredEdge: .maxY)
                }
            }
        }
        
        do {
            try content.write(to: fileURL, atomically: true, encoding: .utf8)
            let picker = NSSharingServicePicker(items: [fileURL])
            show(picker)
        } catch {
            print("Failed to write temp file for sharing: \(error)")
            // 降级为直接分享文本
            let picker = NSSharingServicePicker(items: [content])
            show(picker)
        }
    }
}

#Preview {
    ContentView()
}
