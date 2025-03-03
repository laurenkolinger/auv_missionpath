import React from "react";
import MissionPathWithIncidents from "./MissionPathWithIncidents";
import "./styles.css";

// Mission visualization configuration
const MISSION_CONFIG = {
  // The JSON file containing waypoints and mission details
  jsonPath: "/data/Runway.json",

  // The CSV file containing actual mission path data
  // Required columns: timestamp_ros, latitude, longitude, depth
  // Optional columns: roll, pitch, yaw, errorState, distance_to_ocean_floor
  csvPath: "/data/mission1_travel_path_runway.csv",
};

function App() {
  return (
    <div className="App">
      <MissionPathWithIncidents
        missionJsonPath={MISSION_CONFIG.jsonPath}
        missionCsvPath={MISSION_CONFIG.csvPath}
      />
    </div>
  );
}

export default App;
