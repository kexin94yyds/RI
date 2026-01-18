//
//  Notebook_MacApp.swift
//  Notebook-Mac
//
//  Created by 可鑫 on 2025/12/31.
//

import Carbon
import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, ObservableObject {
    var mainWindow: NSWindow?
    var standaloneWindows: [NSWindow] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 设置为附属应用（隐藏 Dock 图标）
        NSApp.setActivationPolicy(.accessory)
        
        // 注册 Option + M (M 的 KeyCode 是 46)
        HotKeyManager.shared.register(keyCode: 46, modifiers: UInt32(optionKey))
        
        HotKeyManager.shared.onHotKeyTriggered = {
            self.toggleWindow()
        }
    }
    
    // 供 ContentView 调用以捕获窗口
    func setupWindow(_ window: NSWindow, isMain: Bool = true) {
        print("Setup Window: \(window), isMain: \(isMain)")
        if isMain {
            self.mainWindow = window
            window.title = "RI 笔记 (主窗口)"
        } else {
            if !standaloneWindows.contains(window) {
                standaloneWindows.append(window)
            }
            window.title = "新建笔记"
        }
        window.delegate = self
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        
        // 强制显示窗口，防止由于某些状态导致不显示
        window.makeKeyAndOrderFront(nil)
    }
    
    // 点击关闭按钮时的逻辑
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if sender == mainWindow {
            NSApp.hide(nil)
            return false
        }
        // 独立窗口允许关闭
        standaloneWindows.removeAll { $0 == sender }
        return true
    }
    
    func toggleWindow() {
        guard let window = mainWindow ?? NSApp.windows.first else { return }
        
        if NSApp.isActive && window.isVisible {
            NSApp.hide(nil)
        } else {
            NSApp.activate(ignoringOtherApps: true)
            window.makeKeyAndOrderFront(nil)
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        }
    }
}

@main
struct Notebook_MacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    @Environment(\.openWindow) private var openWindow
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appDelegate)
        }
        
        WindowGroup("新建笔记", id: "standalone-editor") {
            StandaloneEditorView()
                .frame(minWidth: 800, minHeight: 600)
                .environmentObject(appDelegate)
        }
        .windowStyle(.titleBar)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("新建笔记窗口") {
                    openWindow(id: "standalone-editor")
                }
                .keyboardShortcut("n", modifiers: .command)
            }
        }
    }
}
