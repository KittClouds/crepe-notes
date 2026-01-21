//! CozoCalendar - Fantasy Calendar CRUD API
//!
//! Handles calendar definitions, events, and periods via CozoDB.
//! Exposed via WASM for TypeScript consumption.

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use serde_json::Value as JsonValue;
use std::cell::RefCell;
use std::collections::BTreeMap;

use crate::db::cozo_graph::CozoGraph;
use crate::db::cozo_shared::COZO_DB;

// =============================================================================
// Types
// =============================================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CalendarDefinitionRecord {
    pub id: String,
    pub world_id: String,
    pub name: String,
    pub hours_per_day: i64,
    pub minutes_per_hour: i64,
    pub seconds_per_minute: i64,
    pub has_year_zero: bool,
    pub created_from: String,
    pub weekdays: JsonValue,
    pub months: JsonValue,
    pub eras: JsonValue,
    pub epochs: JsonValue,
    pub moons: JsonValue,
    pub seasons: JsonValue,
    pub current_date: JsonValue,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CalendarEventRecord {
    pub id: String,
    pub calendar_id: String,
    pub title: String,
    pub description: Option<String>,
    pub date_year: i64,
    pub date_month: i64,
    pub date_day: i64,
    pub date_hour: Option<i64>,
    pub date_minute: Option<i64>,
    pub end_year: Option<i64>,
    pub end_month: Option<i64>,
    pub end_day: Option<i64>,
    pub is_all_day: bool,
    pub importance: String,
    pub category: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub entity_id: Option<String>,
    pub entity_kind: Option<String>,
    pub source_note_id: Option<String>,
    pub parent_event_id: Option<String>,
    pub status: Option<String>,
    pub narrative_type: Option<String>,
    pub story_beat: Option<String>,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CalendarPeriodRecord {
    pub id: String,
    pub calendar_id: String,
    pub name: String,
    pub description: Option<String>,
    pub start_year: i64,
    pub start_month: Option<i64>,
    pub end_year: Option<i64>,
    pub end_month: Option<i64>,
    pub parent_period_id: Option<String>,
    pub period_type: String,
    pub color: String,
    pub icon: Option<String>,
    pub abbreviation: Option<String>,
    pub direction: String,
    pub arc_type: Option<String>,
    pub dominant_theme: Option<String>,
    pub protagonist_id: Option<String>,
    pub antagonist_id: Option<String>,
    pub summary: Option<String>,
    pub show_on_timeline: bool,
    pub timeline_color: Option<String>,
    pub timeline_icon: Option<String>,
    pub created_at: f64,
    pub updated_at: f64,
}

// =============================================================================
// Helpers
// =============================================================================

fn get_string(row: &BTreeMap<String, JsonValue>, key: &str) -> String {
    row.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn get_string_opt(row: &BTreeMap<String, JsonValue>, key: &str) -> Option<String> {
    row.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn get_i64(row: &BTreeMap<String, JsonValue>, key: &str, default: i64) -> i64 {
    row.get(key)
        .and_then(|v| v.as_i64())
        .unwrap_or(default)
}

fn get_i64_opt(row: &BTreeMap<String, JsonValue>, key: &str) -> Option<i64> {
    row.get(key).and_then(|v| v.as_i64())
}

fn get_f64(row: &BTreeMap<String, JsonValue>, key: &str, default: f64) -> f64 {
    row.get(key)
        .and_then(|v| v.as_f64())
        .unwrap_or(default)
}

fn get_bool(row: &BTreeMap<String, JsonValue>, key: &str) -> bool {
    row.get(key)
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn get_json(row: &BTreeMap<String, JsonValue>, key: &str) -> JsonValue {
    row.get(key).cloned().unwrap_or(JsonValue::Null)
}

fn generate_id() -> String {
    // Generate a unique ID using timestamp + random in WASM
    let timestamp = now_ms() as u64;
    let random = (js_sys::Math::random() * 1_000_000.0) as u64;
    format!("cal_{:x}_{:x}", timestamp, random)
}

fn now_ms() -> f64 {
    js_sys::Date::now()
}

fn escape_str(s: &str) -> String {
    s.replace('\\', r"\\").replace('"', r#"\""#)
}

// =============================================================================
// Calendar Definition CRUD
// =============================================================================

/// Create calendar definition schema (called from init_schema)
pub fn calendar_schema() -> &'static str {
    r#"
        :create calendar_definitions {
            id: String
            =>
            world_id: String,
            name: String,
            hours_per_day: Int,
            minutes_per_hour: Int,
            seconds_per_minute: Int,
            has_year_zero: Bool,
            created_from: String,
            weekdays: Json,
            months: Json,
            eras: Json,
            epochs: Json,
            moons: Json,
            seasons: Json,
            current_date: Json,
            created_at: Float,
            updated_at: Float
        }
    "#
}

pub fn calendar_events_schema() -> &'static str {
    r#"
        :create calendar_events {
            id: String
            =>
            calendar_id: String,
            title: String,
            description: String?,
            date_year: Int,
            date_month: Int,
            date_day: Int,
            date_hour: Int?,
            date_minute: Int?,
            end_year: Int?,
            end_month: Int?,
            end_day: Int?,
            is_all_day: Bool,
            importance: String,
            category: String,
            color: String?,
            icon: String?,
            entity_id: String?,
            entity_kind: String?,
            source_note_id: String?,
            parent_event_id: String?,
            status: String?,
            narrative_type: String?,
            story_beat: String?,
            created_at: Float,
            updated_at: Float
        }
    "#
}

pub fn calendar_periods_schema() -> &'static str {
    r#"
        :create calendar_periods {
            id: String
            =>
            calendar_id: String,
            name: String,
            description: String?,
            start_year: Int,
            start_month: Int?,
            end_year: Int?,
            end_month: Int?,
            parent_period_id: String?,
            period_type: String,
            color: String,
            icon: String?,
            abbreviation: String?,
            direction: String,
            arc_type: String?,
            dominant_theme: String?,
            protagonist_id: String?,
            antagonist_id: String?,
            summary: String?,
            show_on_timeline: Bool,
            timeline_color: String?,
            timeline_icon: String?,
            created_at: Float,
            updated_at: Float
        }
    "#
}

// =============================================================================
// Calendar Definition WASM API
// =============================================================================

#[wasm_bindgen]
pub fn calendar_get_definition(world_id: &str) -> Result<JsValue, JsValue> {
    let query = format!(
        r#"?[id, world_id, name, hours_per_day, minutes_per_hour, seconds_per_minute,
            has_year_zero, created_from, weekdays, months, eras, epochs, moons, seasons,
            current_date, created_at, updated_at] :=
            *calendar_definitions{{id, world_id, name, hours_per_day, minutes_per_hour,
                seconds_per_minute, has_year_zero, created_from, weekdays, months,
                eras, epochs, moons, seasons, current_date, created_at, updated_at}},
            world_id == "{}"
        :limit 1"#,
        escape_str(world_id)
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                let result = graph.query(&query)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))?;
                
                if result.is_empty() {
                    Ok(JsValue::NULL)
                } else {
                    let row = &result[0];
                    let def = CalendarDefinitionRecord {
                        id: get_string(row, "id"),
                        world_id: get_string(row, "world_id"),
                        name: get_string(row, "name"),
                        hours_per_day: get_i64(row, "hours_per_day", 24),
                        minutes_per_hour: get_i64(row, "minutes_per_hour", 60),
                        seconds_per_minute: get_i64(row, "seconds_per_minute", 60),
                        has_year_zero: get_bool(row, "has_year_zero"),
                        created_from: get_string(row, "created_from"),
                        weekdays: get_json(row, "weekdays"),
                        months: get_json(row, "months"),
                        eras: get_json(row, "eras"),
                        epochs: get_json(row, "epochs"),
                        moons: get_json(row, "moons"),
                        seasons: get_json(row, "seasons"),
                        current_date: get_json(row, "current_date"),
                        created_at: get_f64(row, "created_at", 0.0),
                        updated_at: get_f64(row, "updated_at", 0.0),
                    };
                    serde_wasm_bindgen::to_value(&def)
                        .map_err(|e| JsValue::from_str(&format!("{}", e)))
                }
            }
        }
    })
}

#[wasm_bindgen]
pub fn calendar_save_definition(def_json: &str) -> Result<bool, JsValue> {
    let def: CalendarDefinitionRecord = serde_json::from_str(def_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    
    let now = now_ms();
    
    let query = format!(
        r#"?[id, world_id, name, hours_per_day, minutes_per_hour, seconds_per_minute,
            has_year_zero, created_from, weekdays, months, eras, epochs, moons, seasons,
            current_date, created_at, updated_at] <- [[
            "{}", "{}", "{}", {}, {}, {}, {}, "{}",
            {}, {}, {}, {}, {}, {}, {}, {}, {}
        ]]
        :put calendar_definitions {{
            id => world_id, name, hours_per_day, minutes_per_hour, seconds_per_minute,
            has_year_zero, created_from, weekdays, months, eras, epochs, moons, seasons,
            current_date, created_at, updated_at
        }}"#,
        escape_str(&def.id),
        escape_str(&def.world_id),
        escape_str(&def.name),
        def.hours_per_day,
        def.minutes_per_hour,
        def.seconds_per_minute,
        def.has_year_zero,
        escape_str(&def.created_from),
        def.weekdays.to_string(),
        def.months.to_string(),
        def.eras.to_string(),
        def.epochs.to_string(),
        def.moons.to_string(),
        def.seasons.to_string(),
        def.current_date.to_string(),
        if def.created_at > 0.0 { def.created_at } else { now },
        now
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                graph.query(&query)
                    .map(|_| true)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

// =============================================================================
// Calendar Events WASM API
// =============================================================================

#[wasm_bindgen]
pub fn calendar_get_all_events(calendar_id: &str) -> Result<JsValue, JsValue> {
    let query = format!(
        r#"?[id, calendar_id, title, description, date_year, date_month, date_day,
            date_hour, date_minute, end_year, end_month, end_day, is_all_day,
            importance, category, color, icon, entity_id, entity_kind, source_note_id,
            parent_event_id, status, narrative_type, story_beat, created_at, updated_at] :=
            *calendar_events{{id, calendar_id, title, description, date_year, date_month,
                date_day, date_hour, date_minute, end_year, end_month, end_day, is_all_day,
                importance, category, color, icon, entity_id, entity_kind, source_note_id,
                parent_event_id, status, narrative_type, story_beat, created_at, updated_at}},
            calendar_id == "{}"
        :order date_year, date_month, date_day"#,
        escape_str(calendar_id)
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                let result = graph.query(&query)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))?;
                
                let events: Vec<CalendarEventRecord> = result.iter().map(|row| {
                    CalendarEventRecord {
                        id: get_string(row, "id"),
                        calendar_id: get_string(row, "calendar_id"),
                        title: get_string(row, "title"),
                        description: get_string_opt(row, "description"),
                        date_year: get_i64(row, "date_year", 0),
                        date_month: get_i64(row, "date_month", 0),
                        date_day: get_i64(row, "date_day", 0),
                        date_hour: get_i64_opt(row, "date_hour"),
                        date_minute: get_i64_opt(row, "date_minute"),
                        end_year: get_i64_opt(row, "end_year"),
                        end_month: get_i64_opt(row, "end_month"),
                        end_day: get_i64_opt(row, "end_day"),
                        is_all_day: get_bool(row, "is_all_day"),
                        importance: get_string(row, "importance"),
                        category: get_string(row, "category"),
                        color: get_string_opt(row, "color"),
                        icon: get_string_opt(row, "icon"),
                        entity_id: get_string_opt(row, "entity_id"),
                        entity_kind: get_string_opt(row, "entity_kind"),
                        source_note_id: get_string_opt(row, "source_note_id"),
                        parent_event_id: get_string_opt(row, "parent_event_id"),
                        status: get_string_opt(row, "status"),
                        narrative_type: get_string_opt(row, "narrative_type"),
                        story_beat: get_string_opt(row, "story_beat"),
                        created_at: get_f64(row, "created_at", 0.0),
                        updated_at: get_f64(row, "updated_at", 0.0),
                    }
                }).collect();

                serde_wasm_bindgen::to_value(&events)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

#[wasm_bindgen]
pub fn calendar_create_event(event_json: &str) -> Result<JsValue, JsValue> {
    let event: CalendarEventRecord = serde_json::from_str(event_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    
    let now = now_ms();
    let id = if event.id.is_empty() { generate_id() } else { event.id.clone() };
    
    // Build query with proper null handling for optional fields
    let query = format!(
        r#"?[id, calendar_id, title, description, date_year, date_month, date_day,
            date_hour, date_minute, end_year, end_month, end_day, is_all_day,
            importance, category, color, icon, entity_id, entity_kind, source_note_id,
            parent_event_id, status, narrative_type, story_beat, created_at, updated_at] <- [[
            "{}", "{}", "{}", {}, {}, {}, {},
            {}, {}, {}, {}, {}, {},
            "{}", "{}", {}, {}, {}, {}, {},
            {}, {}, {}, {}, {}, {}
        ]]
        :put calendar_events {{
            id => calendar_id, title, description, date_year, date_month, date_day,
            date_hour, date_minute, end_year, end_month, end_day, is_all_day,
            importance, category, color, icon, entity_id, entity_kind, source_note_id,
            parent_event_id, status, narrative_type, story_beat, created_at, updated_at
        }}"#,
        escape_str(&id),
        escape_str(&event.calendar_id),
        escape_str(&event.title),
        opt_str_to_cozo(&event.description),
        event.date_year,
        event.date_month,
        event.date_day,
        opt_i64_to_cozo(event.date_hour),
        opt_i64_to_cozo(event.date_minute),
        opt_i64_to_cozo(event.end_year),
        opt_i64_to_cozo(event.end_month),
        opt_i64_to_cozo(event.end_day),
        event.is_all_day,
        escape_str(&event.importance),
        escape_str(&event.category),
        opt_str_to_cozo(&event.color),
        opt_str_to_cozo(&event.icon),
        opt_str_to_cozo(&event.entity_id),
        opt_str_to_cozo(&event.entity_kind),
        opt_str_to_cozo(&event.source_note_id),
        opt_str_to_cozo(&event.parent_event_id),
        opt_str_to_cozo(&event.status),
        opt_str_to_cozo(&event.narrative_type),
        opt_str_to_cozo(&event.story_beat),
        now,
        now
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                graph.query(&query)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))?;
                
                // Return the created event with ID
                let mut created = event.clone();
                created.id = id;
                created.created_at = now;
                created.updated_at = now;
                
                serde_wasm_bindgen::to_value(&created)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

#[wasm_bindgen]
pub fn calendar_delete_event(id: &str) -> Result<bool, JsValue> {
    let query = format!(
        r#"?[id] <- [["{}"]] :rm calendar_events {{id}}"#,
        escape_str(id)
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                graph.query(&query)
                    .map(|_| true)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

// =============================================================================
// Calendar Periods WASM API
// =============================================================================

#[wasm_bindgen]
pub fn calendar_get_all_periods(calendar_id: &str) -> Result<JsValue, JsValue> {
    let query = format!(
        r#"?[id, calendar_id, name, description, start_year, start_month, end_year, end_month,
            parent_period_id, period_type, color, icon, abbreviation, direction, arc_type,
            dominant_theme, protagonist_id, antagonist_id, summary, show_on_timeline,
            timeline_color, timeline_icon, created_at, updated_at] :=
            *calendar_periods{{id, calendar_id, name, description, start_year, start_month,
                end_year, end_month, parent_period_id, period_type, color, icon, abbreviation,
                direction, arc_type, dominant_theme, protagonist_id, antagonist_id, summary,
                show_on_timeline, timeline_color, timeline_icon, created_at, updated_at}},
            calendar_id == "{}"
        :order start_year, start_month"#,
        escape_str(calendar_id)
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                let result = graph.query(&query)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))?;
                
                let periods: Vec<CalendarPeriodRecord> = result.iter().map(|row| {
                    CalendarPeriodRecord {
                        id: get_string(row, "id"),
                        calendar_id: get_string(row, "calendar_id"),
                        name: get_string(row, "name"),
                        description: get_string_opt(row, "description"),
                        start_year: get_i64(row, "start_year", 0),
                        start_month: get_i64_opt(row, "start_month"),
                        end_year: get_i64_opt(row, "end_year"),
                        end_month: get_i64_opt(row, "end_month"),
                        parent_period_id: get_string_opt(row, "parent_period_id"),
                        period_type: get_string(row, "period_type"),
                        color: get_string(row, "color"),
                        icon: get_string_opt(row, "icon"),
                        abbreviation: get_string_opt(row, "abbreviation"),
                        direction: get_string(row, "direction"),
                        arc_type: get_string_opt(row, "arc_type"),
                        dominant_theme: get_string_opt(row, "dominant_theme"),
                        protagonist_id: get_string_opt(row, "protagonist_id"),
                        antagonist_id: get_string_opt(row, "antagonist_id"),
                        summary: get_string_opt(row, "summary"),
                        show_on_timeline: get_bool(row, "show_on_timeline"),
                        timeline_color: get_string_opt(row, "timeline_color"),
                        timeline_icon: get_string_opt(row, "timeline_icon"),
                        created_at: get_f64(row, "created_at", 0.0),
                        updated_at: get_f64(row, "updated_at", 0.0),
                    }
                }).collect();

                serde_wasm_bindgen::to_value(&periods)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

#[wasm_bindgen]
pub fn calendar_create_period(period_json: &str) -> Result<JsValue, JsValue> {
    let period: CalendarPeriodRecord = serde_json::from_str(period_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    
    let now = now_ms();
    let id = if period.id.is_empty() { generate_id() } else { period.id.clone() };
    
    let query = format!(
        r#"?[id, calendar_id, name, description, start_year, start_month, end_year, end_month,
            parent_period_id, period_type, color, icon, abbreviation, direction, arc_type,
            dominant_theme, protagonist_id, antagonist_id, summary, show_on_timeline,
            timeline_color, timeline_icon, created_at, updated_at] <- [[
            "{}", "{}", "{}", {}, {}, {}, {}, {},
            {}, "{}", "{}", {}, {}, "{}", {}, {}, {}, {}, {},
            {}, {}, {}, {}, {}
        ]]
        :put calendar_periods {{
            id => calendar_id, name, description, start_year, start_month, end_year, end_month,
            parent_period_id, period_type, color, icon, abbreviation, direction, arc_type,
            dominant_theme, protagonist_id, antagonist_id, summary, show_on_timeline,
            timeline_color, timeline_icon, created_at, updated_at
        }}"#,
        escape_str(&id),
        escape_str(&period.calendar_id),
        escape_str(&period.name),
        opt_str_to_cozo(&period.description),
        period.start_year,
        opt_i64_to_cozo(period.start_month),
        opt_i64_to_cozo(period.end_year),
        opt_i64_to_cozo(period.end_month),
        opt_str_to_cozo(&period.parent_period_id),
        escape_str(&period.period_type),
        escape_str(&period.color),
        opt_str_to_cozo(&period.icon),
        opt_str_to_cozo(&period.abbreviation),
        escape_str(&period.direction),
        opt_str_to_cozo(&period.arc_type),
        opt_str_to_cozo(&period.dominant_theme),
        opt_str_to_cozo(&period.protagonist_id),
        opt_str_to_cozo(&period.antagonist_id),
        opt_str_to_cozo(&period.summary),
        period.show_on_timeline,
        opt_str_to_cozo(&period.timeline_color),
        opt_str_to_cozo(&period.timeline_icon),
        now,
        now
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                graph.query(&query)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))?;
                
                let mut created = period.clone();
                created.id = id;
                created.created_at = now;
                created.updated_at = now;
                
                serde_wasm_bindgen::to_value(&created)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

#[wasm_bindgen]
pub fn calendar_delete_period(id: &str) -> Result<bool, JsValue> {
    let query = format!(
        r#"?[id] <- [["{}"]] :rm calendar_periods {{id}}"#,
        escape_str(id)
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                graph.query(&query)
                    .map(|_| true)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

// =============================================================================
// Helpers for Optional Values in CozoDB queries
// =============================================================================

fn opt_str_to_cozo(s: &Option<String>) -> String {
    match s {
        Some(val) => format!("\"{}\"", escape_str(val)),
        None => "null".to_string(),
    }
}

fn opt_i64_to_cozo(i: Option<i64>) -> String {
    match i {
        Some(val) => val.to_string(),
        None => "null".to_string(),
    }
}
