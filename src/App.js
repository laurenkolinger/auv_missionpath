import React, { useState, useEffect } from "react";
import MissionPathWithIncidents from "./MissionPathWithIncidents";
import { format } from "date-fns";
import "./styles.css";

function App() {
  const [missions, setMissions] = useState([]);
  const [selectedMissionId, setSelectedMissionId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auto-discover missions on mount
  useEffect(() => {
    fetch("/missions.json")
      .then((res) => res.json())
      .then((data) => {
        setMissions(data);
        if (data.length > 0) {
          setSelectedMissionId(data[0].id);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load missions:", err);
        setLoading(false);
      });
  }, []);

  const selectedMission = missions.find((m) => m.id === selectedMissionId);

  const getMissionPaths = (mission) => {
    if (!mission) return null;
    return {
      jsonPath: `data/${mission.folder}/${mission.jsonFile}`,
      csvPath: `data/${mission.folder}/${mission.csvFile}`,
      usblPath: mission.usblFile
        ? `data/${mission.folder}/${mission.usblFile}`
        : undefined,
    };
  };

  // Group missions by date
  const groupedMissions = missions.reduce((groups, mission) => {
    const dateKey = mission.date || "Unknown";
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(mission);
    return groups;
  }, {});

  // Format date for display
  const formatDateHeader = (dateStr) => {
    if (!dateStr || dateStr === "Unknown") return "Unknown Date";
    try {
      const year = dateStr.substring(0, 4);
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = dateStr.substring(6, 8);
      const date = new Date(year, month, day);
      return format(date, "EEEE, d MMMM yyyy");
    } catch (err) {
      return dateStr;
    }
  };

  // Format time from startTime
  const formatTime = (startTime) => {
    if (!startTime) return "";
    try {
      const timeStr = startTime.split(".")[0];
      const hours = timeStr.substring(8, 10);
      const minutes = timeStr.substring(10, 12);
      return ` (${hours}:${minutes})`;
    } catch (err) {
      return "";
    }
  };

  const currentPaths = selectedMission ? getMissionPaths(selectedMission) : null;

  const tabStyle = (isActive) => ({
    padding: "10px 20px",
    cursor: "pointer",
    backgroundColor: isActive ? "#3b82f6" : "#e2e8f0",
    color: isActive ? "white" : "#64748b",
    border: "none",
    borderRadius: "6px",
    fontWeight: isActive ? "600" : "500",
    fontSize: "0.875rem",
    transition: "all 0.2s ease",
    whiteSpace: "nowrap",
  });

  const dateHeaderStyle = {
    padding: "8px 16px",
    backgroundColor: "#f1f5f9",
    borderRadius: "4px",
    fontWeight: "600",
    fontSize: "0.875rem",
    color: "#475569",
    marginTop: "8px",
  };

  if (loading) {
    return (
      <div className="App" style={{ padding: "40px", textAlign: "center" }}>
        Loading missions...
      </div>
    );
  }

  if (missions.length === 0) {
    return (
      <div className="App" style={{ padding: "40px", textAlign: "center" }}>
        No missions found. Add mission folders to public/data/ and run: node generate-missions.js
      </div>
    );
  }

  return (
    <div className="App">
      <div
        style={{
          padding: "16px 16px 0 16px",
          backgroundColor: "#f8fafc",
          borderBottom: "2px solid #e2e8f0",
          overflowX: "auto",
          maxHeight: "200px",
          overflowY: "auto",
        }}
      >
        {Object.keys(groupedMissions)
          .sort((a, b) => b.localeCompare(a))
          .map((dateKey) => (
            <div key={dateKey} style={{ marginBottom: "12px" }}>
              <div style={dateHeaderStyle}>{formatDateHeader(dateKey)}</div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginTop: "8px",
                  paddingLeft: "8px",
                }}
              >
                {groupedMissions[dateKey].map((mission) => (
                  <button
                    key={mission.id}
                    style={tabStyle(selectedMissionId === mission.id)}
                    onClick={() => setSelectedMissionId(mission.id)}
                  >
                    {mission.name}
                    {formatTime(mission.startTime)}
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>

      {currentPaths && (
        <MissionPathWithIncidents
          key={selectedMissionId}
          missionJsonPath={currentPaths.jsonPath}
          missionCsvPath={currentPaths.csvPath}
          usblPath={currentPaths.usblPath}
        />
      )}
    </div>
  );
}

export default App;
