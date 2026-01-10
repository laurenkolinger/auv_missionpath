# Mission Tabs - Auto-Discovery System

## How It Works

The application automatically discovers and creates tabs for all missions in the `public/data/` directory.

## Adding a New Mission

1. Drop your mission folder into `public/data/`
   - Example: `public/data/20260110123456-MyMission/`

2. Your mission folder should contain:
   - `MissionName.json` - Mission plan with waypoints
   - `mission_travel_path.csv` - Actual mission path data
   - `optional_usbl.csv` (optional) - USBL tracking data

3. Run the mission discovery script:
   ```bash
   npm run update-missions
   ```
   or
   ```bash
   node generate-missions.js
   ```

4. Refresh your browser - the new mission will appear as a tab!

## Mission Folder Structure

```
public/data/
├── 20260109153659-Logram09/
│   ├── Logram09.json
│   ├── mission_travel_path.csv
│   └── mission_file_snapshot.mission (optional)
├── 20260109155124-Logram10/
│   ├── Logram10.json
│   └── mission_travel_path.csv
└── your-new-mission/
    ├── YourMission.json
    └── mission_travel_path.csv
```

## Features

- **Automatic Discovery**: No code changes needed
- **Proper Timestamps**: Uses actual mission data timestamps
- **Tab Navigation**: Click tabs to switch between missions
- **Cached Views**: Each mission map is saved when loaded

## Timestamps

The application automatically extracts and displays:
- Mission date from the CSV data
- Start and end times from actual telemetry
- Point-by-point timestamps on hover

All timestamps come from the `timestamp_sys` column in your CSV files.
