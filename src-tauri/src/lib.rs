// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{Manager, Window, Listener};

#[tauri::command]
async fn toggle_window(window: Window) -> Result<(), String> {
    let is_visible = window.is_visible().unwrap_or(false);
    if is_visible {
        window.hide().map_err(|e| e.to_string())?;
    } else {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn show_window(window: Window) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn hide_window(window: Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![toggle_window, show_window, hide_window])
        .setup(|app| {
            // 设置窗口失焦时隐藏
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.listen("tauri://blur", move |_| {
                    let _ = window_clone.hide();
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
