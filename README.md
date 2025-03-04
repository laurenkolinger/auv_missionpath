# Visualize AUV Mission (and other things)

A web-based visualization tool for RangerBot mission telemetry data, supporting multiple data sources including mission paths, waypoints, and USBL tracking data.

close and update with new data at (codesandbox)[https://codesandbox.io/p/github/laurenkolinger/rangerbot_telemetry_3mar25/main?embed=1].

## Data Format Requirements

### 1. Mission Path Data (CSV)

Place your mission path CSV file in the `public/data/` directory. The file should contain the following:

Required columns:

- `timestamp_sys`: System timestamp
- `latitude`: Decimal degrees
- `longitude`: Decimal degrees
- `depth`: Meters

Optional columns:

- `roll`: Degrees
- `pitch`: Degrees
- `yaw`: Degrees
- `errorState`: Integer
- `distance_to_ocean_floor`: Meters
- `velX`, `velY`, `velZ`: Velocity components in m/s
- `battery_volts`: Battery voltage
- `acousticAltimeter`: Altimeter reading in meters
- `navMode`: Navigation mode (0: Normal, 1: Warning, 2: Error)

### 2. Mission Waypoints (JSON)

Place your mission waypoints JSON file in the `public/data/` directory. The file should follow this structure:

```json
{
  "mission_summary": {
    "mission_name": "Mission Name"
  },
  "waypoints": [
    {
      "latitude": decimal,
      "longitude": decimal
    }
  ]
}
```

### 3. USBL Tracking Data (CSV)

Place your USBL tracking data CSV file in the `public/data/` directory. The file should contain columns in this order:

1. timestamp
2. id
3. latitude (decimal degrees)
4. longitude (decimal degrees)
5. depth (meters)

## Configuration

Update the `MISSION_CONFIG` object in `src/App.js` to point to your data files:

```javascript
const MISSION_CONFIG = {
  jsonPath: "/data/your_waypoints.json",
  csvPath: "/data/your_mission_path.csv",
  usblPath: "/data/your_usbl_data.csv",
};
```

## Visualization Features

The visualization includes:

- Mission path with depth coloring
- Planned waypoints
- USBL tracking data
- Vehicle state indicators (depth, velocity, battery, etc.)
- Incident detection and clustering
- Interactive tooltips with detailed information
- Toggleable data layers

## Getting Started

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```
3. Place your data files in the `public/data/` directory
4. Update the `MISSION_CONFIG` in `src/App.js`
5. Start the development server:
   ```bash
   npm start
   # or
   pnpm start
   ```

## Data Processing Notes

- Large datasets are automatically sampled to maintain performance
- Incidents are clustered when they occur within 5 seconds of each other
- All depth values use the same color scale for consistency
- USBL track is shown as both a continuous line and individual points
