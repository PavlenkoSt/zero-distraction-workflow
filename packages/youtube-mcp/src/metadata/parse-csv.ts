import * as fs from "fs";
import { Track } from "../types.js";

interface CsvRow {
  recordIn: string;
  notes: string;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function timecodeToDisplay(tc: string): string {
  // Input: "HH:MM:SS:FF" → Output: "H:MM:SS" (drop frames, trim leading zero hour)
  const parts = tc.split(":");
  if (parts.length < 3) return tc;

  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const seconds = parts[2];

  return `${hours}:${minutes}:${seconds}`;
}

export function parseTimelineCsv(csvPath: string): Track[] {
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    throw new Error("CSV file has no data rows");
  }

  const header = parseCsvLine(lines[0]);
  const headerNorm = header.map((h) => h.toLowerCase().trim());

  // Detect format: music-video-creator uses track_name + start_time columns
  const trackNameIdx = headerNorm.indexOf("track_name");
  const startTimeIdx = headerNorm.indexOf("start_time");
  const trackNumberIdx = headerNorm.indexOf("track_number");

  if (trackNameIdx !== -1 && startTimeIdx !== -1) {
    // music-video-creator format: track_number,track_name,start_time,end_time,duration
    const tracks: Track[] = [];
    let repeatAdded = false;

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i]);
      const trackNum = trackNumberIdx !== -1 ? fields[trackNumberIdx]?.trim() : null;
      const name = fields[trackNameIdx]?.trim();
      const startTime = fields[startTimeIdx]?.trim();

      if (!name || !startTime) continue;

      // Detect repeat: track_number resets back to 1 after first pass
      if (!repeatAdded && trackNum === "1" && tracks.length > 1) {
        tracks.push({ timecode: startTime, name: "Repeat" });
        repeatAdded = true;
        break;
      }

      tracks.push({ timecode: startTime, name });
    }

    return tracks;
  }

  // DaVinci Resolve format: Record In + Notes columns
  const recordInIdx = headerNorm.indexOf("record in");
  const notesIdx = headerNorm.indexOf("notes");

  if (recordInIdx === -1 || notesIdx === -1) {
    throw new Error(
      `CSV missing required columns. Found: ${header.join(", ")}. Need either "track_name"+"start_time" or "Record In"+"Notes"`,
    );
  }

  // Parse data rows
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const recordIn = fields[recordInIdx]?.trim();
    const notes = fields[notesIdx]?.trim();
    if (recordIn && notes) {
      rows.push({ recordIn, notes });
    }
  }

  // Find where tracks start repeating (first duplicate name after ~1 hour)
  const seenNames = new Set<string>();
  const tracks: Track[] = [];

  for (const row of rows) {
    if (seenNames.has(row.notes)) {
      // First repeat found — add "Repeat" marker and stop
      tracks.push({
        timecode: timecodeToDisplay(row.recordIn),
        name: "Repeat",
      });
      break;
    }
    seenNames.add(row.notes);
    tracks.push({
      timecode: timecodeToDisplay(row.recordIn),
      name: row.notes,
    });
  }

  return tracks;
}
