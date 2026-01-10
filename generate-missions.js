const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'public', 'data');
const missions = [];

const dirs = fs.readdirSync(dataDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

for (const dir of dirs) {
  const dirPath = path.join(dataDir, dir);
  const files = fs.readdirSync(dirPath);

  // Extract mission name from folder
  // Folder format: YYYYMMDDHHMMSS-MissionName or just MissionName
  const folderParts = dir.split('-');
  let expectedMissionName;

  if (folderParts.length > 1 && folderParts[0].match(/^\d{14}$/)) {
    // Has timestamp prefix, mission name is everything after first dash
    expectedMissionName = folderParts.slice(1).join('-');
  } else {
    // No timestamp prefix, entire folder name is mission name
    expectedMissionName = dir;
  }

  // Find JSON file - prefer the expected name, fallback to any non-summary JSON
  let jsonFile = files.find(f => f === `${expectedMissionName}.json`);
  if (!jsonFile) {
    jsonFile = files.find(f => f.endsWith('.json') && f !== 'mission_summary.json');
  }

  // Check for CSV file
  const csvFile = files.find(f => f === 'mission_travel_path.csv');

  // Check for USBL file
  const usblFile = files.find(f => f.endsWith('.csv') && f !== 'mission_travel_path.csv');

  // Try to read mission summary for timestamp
  let missionStartTime = null;
  let missionDate = null;
  const summaryPath = path.join(dirPath, 'mission_summary.json');
  if (fs.existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      missionStartTime = summary.mission_start_sys_time;

      // Parse date from timestamp (YYYYMMDDHHmmss.ffffff format)
      if (missionStartTime) {
        const timeStr = missionStartTime.split('.')[0];
        missionDate = timeStr.substring(0, 8); // YYYYMMDD
      }
    } catch (err) {
      console.warn(`Could not read mission summary for ${dir}:`, err.message);
    }
  }

  if (jsonFile && csvFile) {
    const missionName = jsonFile.replace('.json', '');
    missions.push({
      id: dir,
      name: missionName,
      folder: dir,
      jsonFile: jsonFile,
      csvFile: csvFile,
      usblFile: usblFile || null,
      startTime: missionStartTime,
      date: missionDate
    });
  }
}

// Sort missions by date (newest first), then by start time
missions.sort((a, b) => {
  if (a.date && b.date) {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    // Same date, sort by start time
    if (a.startTime && b.startTime) {
      return b.startTime.localeCompare(a.startTime);
    }
  }
  // Fallback to folder name
  return b.folder.localeCompare(a.folder);
});

fs.writeFileSync(
  path.join(__dirname, 'public', 'missions.json'),
  JSON.stringify(missions, null, 2)
);

console.log('Generated missions.json with ' + missions.length + ' missions');
