use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkoutEntry {
    date: String,
    day_type: String,
    exercise: String,
    band: String,
    full_reps: String,
    intermediate_reps: String,
    short_reps: String,
    notes: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DataDocument {
    workouts: Vec<WorkoutEntry>,
    bands: Vec<String>,
}

#[derive(Deserialize, Serialize)]
struct CsvRecord {
    record_type: String,
    date: String,
    day_type: String,
    exercise: String,
    band: String,
    full_reps: String,
    intermediate_reps: String,
    short_reps: String,
    notes: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadedData {
    document: DataDocument,
    revision: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveResult {
    revision: String,
}

fn revision_for(bytes: &[u8]) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{}-{hash:016x}", bytes.len())
}

fn normalize_bands(bands: &[String]) -> Vec<String> {
    let mut result = Vec::new();
    for band in bands {
        let value = band.trim();
        if !value.is_empty() && !result.iter().any(|existing| existing == value) {
            result.push(value.to_owned());
        }
    }
    result
}

fn csv_bytes(document: &DataDocument) -> Result<Vec<u8>, String> {
    let mut writer = csv::Writer::from_writer(Vec::new());

    for name in normalize_bands(&document.bands) {
        writer
            .serialize(CsvRecord {
                record_type: "band".into(),
                date: String::new(),
                day_type: String::new(),
                exercise: String::new(),
                band: String::new(),
                full_reps: String::new(),
                intermediate_reps: String::new(),
                short_reps: String::new(),
                notes: String::new(),
                name,
            })
            .map_err(|error| error.to_string())?;
    }

    for workout in &document.workouts {
        writer
            .serialize(CsvRecord {
                record_type: "workout".into(),
                date: workout.date.clone(),
                day_type: workout.day_type.clone(),
                exercise: workout.exercise.clone(),
                band: workout.band.clone(),
                full_reps: workout.full_reps.clone(),
                intermediate_reps: workout.intermediate_reps.clone(),
                short_reps: workout.short_reps.clone(),
                notes: workout.notes.clone(),
                name: String::new(),
            })
            .map_err(|error| error.to_string())?;
    }

    writer.flush().map_err(|error| error.to_string())?;
    writer.into_inner().map_err(|error| error.to_string())
}

fn parse_csv(bytes: &[u8]) -> Result<DataDocument, String> {
    if bytes.is_empty() {
        return Ok(DataDocument {
            workouts: Vec::new(),
            bands: Vec::new(),
        });
    }

    let mut reader = csv::Reader::from_reader(bytes);
    let mut workouts = Vec::new();
    let mut bands = Vec::new();

    for result in reader.deserialize::<CsvRecord>() {
        let row = result.map_err(|error| format!("Could not read CSV row: {error}"))?;
        match row.record_type.as_str() {
            "band" => bands.push(row.name),
            "workout" => workouts.push(WorkoutEntry {
                date: row.date,
                day_type: row.day_type,
                exercise: row.exercise,
                band: row.band,
                full_reps: row.full_reps,
                intermediate_reps: row.intermediate_reps,
                short_reps: row.short_reps,
                notes: row.notes,
            }),
            _ => {}
        }
    }

    Ok(DataDocument {
        workouts,
        bands: normalize_bands(&bands),
    })
}

fn write_csv(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut temp_path = PathBuf::from(path);
    let extension = path
        .extension()
        .map(|value| format!("{}.tmp", value.to_string_lossy()))
        .unwrap_or_else(|| "tmp".into());
    temp_path.set_extension(extension);

    let mut file = fs::File::create(&temp_path)
        .map_err(|error| format!("Could not create temporary file: {error}"))?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("Could not write temporary file: {error}"))?;
    fs::copy(&temp_path, path).map_err(|error| format!("Could not update CSV file: {error}"))?;
    fs::remove_file(&temp_path)
        .map_err(|error| format!("Could not remove temporary file: {error}"))?;
    Ok(())
}

#[tauri::command]
fn load_data_file(path: String) -> Result<LoadedData, String> {
    let bytes = fs::read(&path).map_err(|error| format!("Could not open CSV file: {error}"))?;
    let document = parse_csv(&bytes)?;
    Ok(LoadedData {
        document,
        revision: revision_for(&bytes),
    })
}

#[tauri::command]
fn save_data_file(
    path: String,
    document: DataDocument,
    expected_revision: Option<String>,
) -> Result<SaveResult, String> {
    if let Some(expected) = expected_revision {
        if Path::new(&path).exists() {
            let current = fs::read(&path)
                .map_err(|error| format!("Could not check CSV file before saving: {error}"))?;
            if revision_for(&current) != expected {
                return Err("The CSV file changed on another computer. Reload it before saving.".into());
            }
        }
    }

    let bytes = csv_bytes(&document)?;
    write_csv(Path::new(&path), &bytes)?;
    Ok(SaveResult {
        revision: revision_for(&bytes),
    })
}

#[tauri::command]
fn export_data_file(path: String, document: DataDocument) -> Result<(), String> {
    let bytes = csv_bytes(&document)?;
    write_csv(Path::new(&path), &bytes)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_data_file,
            save_data_file,
            export_data_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running X3 Workout Tracker");
}
