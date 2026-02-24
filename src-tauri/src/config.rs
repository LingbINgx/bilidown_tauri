use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub save_path: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            save_path: "./download".to_string(),
        }
    }
}

pub struct ConfigState {
    pub config: Mutex<AppConfig>,
}

impl ConfigState {
    pub fn new() -> Self {
        let config = Self::load().unwrap_or_default();
        Self {
            config: Mutex::new(config),
        }
    }

    fn load() -> Option<AppConfig> {
        let path = Path::new("config.json");
        if path.exists() {
            let content = fs::read_to_string(path).ok()?;
            serde_json::from_str(&content).ok()
        } else {
            None
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let config = self.config.lock().map_err(|e| e.to_string())?;
        let json = serde_json::to_string_pretty(&*config).map_err(|e| e.to_string())?;
        fs::write("config.json", json).map_err(|e| e.to_string())
    }
}
