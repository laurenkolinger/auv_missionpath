import React from "react";
import MissionPathWithIncidents from "./MissionPathWithIncidents";
import "./styles.css";

function App() {
  return (
    <div className="App">
      <MissionPathWithIncidents 
        missionJsonPath="/data/mission1.json"
        missionCsvPath="/data/mission1_path.csv"
      />
    </div>
  );
}

export default App;
