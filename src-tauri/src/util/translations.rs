// We have this small util to handle translation because right now we don't
// need the full complexity of an actual translation crate like fluent, if
// we ever need more advanced features like pluralization we can switch to
// fluent. For now a simple util that uses our current front-end translation
// structure works

use std::collections::HashMap;

use serde_json::Value;

const EN_MENU: &str = include_str!("../../../src/lib/i18n/locales/en/system-menu.json");
const ES_MENU: &str = include_str!("../../../src/lib/i18n/locales/es/system-menu.json");
const DE_MENU: &str = include_str!("../../../src/lib/i18n/locales/de/system-menu.json");
const FR_MENU: &str = include_str!("../../../src/lib/i18n/locales/fr/system-menu.json");
const IT_MENU: &str = include_str!("../../../src/lib/i18n/locales/it/system-menu.json");
const PT_MENU: &str = include_str!("../../../src/lib/i18n/locales/pt/system-menu.json");
const RU_MENU: &str = include_str!("../../../src/lib/i18n/locales/ru/system-menu.json");
const JA_MENU: &str = include_str!("../../../src/lib/i18n/locales/ja/system-menu.json");
const KO_MENU: &str = include_str!("../../../src/lib/i18n/locales/ko/system-menu.json");
const ZH_MENU: &str = include_str!("../../../src/lib/i18n/locales/zh/system-menu.json");

pub struct Translations {
    map: HashMap<String, String>,
}

impl Translations {
    pub fn from_system_locale() -> Self {
        let locale = tauri_plugin_os::locale().unwrap_or_else(|| "en".to_string());
        let lang_code = locale.split('-').next().unwrap_or("en");

        let json = match lang_code {
            "es" => ES_MENU,
            "de" => DE_MENU,
            "fr" => FR_MENU,
            "it" => IT_MENU,
            "pt" => PT_MENU,
            "ru" => RU_MENU,
            "ja" => JA_MENU,
            "ko" => KO_MENU,
            "zh" => ZH_MENU,
            _ => EN_MENU,
        };

        let parsed: HashMap<String, Value> =
            serde_json::from_str(json).expect("Invalid menu locale JSON");

        let map = parsed
            .into_iter()
            .filter_map(|(k, v)| match v {
                Value::String(s) => Some((k, s)),
                _ => None,
            })
            .collect();

        Translations { map }
    }

    pub fn t<'a>(&'a self, key: &'a str) -> &'a str {
        self.map.get(key).map(String::as_str).unwrap_or(key)
    }
}
