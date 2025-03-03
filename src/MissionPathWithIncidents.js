import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import _ from "lodash";

const MissionPathWithIncidents = ({ missionJsonPath, missionCsvPath }) => {
  const [actualData, setActualData] = useState([]);
  const [plannedData, setPlannedData] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [depthRange, setDepthRange] = useState({ min: 0, max: 0 });
  const [viewBox, setViewBox] = useState({
    minLat: 0,
    maxLat: 0,
    minLong: 0,
    maxLong: 0,
  });
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [hoveredType, setHoveredType] = useState(null);
  const [hoveredIncident, setHoveredIncident] = useState(null);
  const [showAttitude, setShowAttitude] = useState(false);

  // Load mission data on component mount
  useEffect(() => {
    const loadMissionData = async () => {
      try {
        setLoading(true);
        
        // Load and parse mission JSON
        const missionResponse = await fetch(missionJsonPath);
        const missionData = await missionResponse.json();
        
        if (!missionData.waypoints || !Array.isArray(missionData.waypoints)) {
          throw new Error("Invalid mission file format: missing waypoints array");
        }

        // Load and parse mission path CSV
        const pathResponse = await fetch(missionCsvPath);
        const pathText = await pathResponse.text();
        const parsedPath = Papa.parse(pathText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });

        const validPathData = parsedPath.data.filter(
          (row) =>
            row.latitude !== null &&
            row.longitude !== null &&
            row.depth !== null
        );

        if (validPathData.length === 0) {
          throw new Error("No valid data points found in path file");
        }

        processData(validPathData, missionData.waypoints);
      } catch (err) {
        console.error("Error loading mission data:", err);
        setError(`Error loading mission data: ${err.message}`);
        setLoading(false);
      }
    };

    loadMissionData();
  }, [missionJsonPath, missionCsvPath]);

  // Function to process data
  const processData = (newActualData, newPlannedData) => {
    try {
      // Sample the data to avoid rendering too many points if it's large
      const sampleRate = Math.ceil(newActualData.length / 2000);
      const sampledData = newActualData.filter(
        (_, index) => index % sampleRate === 0
      );

      // Calculate depth range for color mapping
      if (sampledData.length > 0) {
        const depthValues = sampledData.map((row) => row.depth);
        const minDepth = Math.min(...depthValues);
        const maxDepth = Math.max(...depthValues);
        setDepthRange({ min: minDepth, max: maxDepth });
      }

      // Detect incidents
      const detectedIncidents = detectIncidents(newActualData);
      setIncidents(detectedIncidents);

      // Calculate the geographic bounds
      if (sampledData.length > 0 && newPlannedData.length > 0) {
        const actualLats = sampledData.map((row) => row.latitude);
        const actualLongs = sampledData.map((row) => row.longitude);
        const plannedLats = newPlannedData.map((wp) => wp.latitude);
        const plannedLongs = newPlannedData.map((wp) => wp.longitude);

        const allLats = [...actualLats, ...plannedLats];
        const allLongs = [...actualLongs, ...plannedLongs];

        const minLat = Math.min(...allLats);
        const maxLat = Math.max(...allLats);
        const minLong = Math.min(...allLongs);
        const maxLong = Math.max(...allLongs);

        // Add some padding to the bounds
        const latPadding = (maxLat - minLat) * 0.1;
        const longPadding = (maxLong - minLong) * 0.1;

        setViewBox({
          minLat: minLat - latPadding,
          maxLat: maxLat + latPadding,
          minLong: minLong - longPadding,
          maxLong: maxLong + longPadding,
        });
      }

      setActualData(sampledData);
      setPlannedData(newPlannedData);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error("Error processing data:", err);
      setError(`Error processing data: ${err.message}`);
      setLoading(false);
    }
  };

  // Function to detect incidents in the data
  const detectIncidents = (data) => {
    // Define thresholds for what we consider abnormal
    const thresholds = {
      roll: 45, // degrees - significant roll
      pitch: 45, // degrees - significant pitch
      depthChange: 1.0, // meters per second - rapid depth change
      errorState: 0, // any non-zero error state
      minDistanceToOceanFloor: 0.5, // meters - potential collision with ocean floor
    };

    // Find incidents
    const foundIncidents = [];
    for (let i = 0; i < data.length; i++) {
      const point = data[i];

      // Skip points with missing critical data
      if (
        !point.timestamp_ros ||
        point.roll === undefined ||
        point.pitch === undefined
      ) {
        continue;
      }

      const reasons = [];

      // Check for extreme attitude values
      if (Math.abs(point.roll) > thresholds.roll) {
        reasons.push(`Extreme roll: ${point.roll.toFixed(2)}°`);
      }

      if (Math.abs(point.pitch) > thresholds.pitch) {
        reasons.push(`Extreme pitch: ${point.pitch.toFixed(2)}°`);
      }

      // Check for error states
      if (point.errorState > thresholds.errorState) {
        reasons.push(`Error state: ${point.errorState}`);
      }

      // Check for proximity to ocean floor
      if (
        point.distance_to_ocean_floor !== undefined &&
        point.distance_to_ocean_floor < thresholds.minDistanceToOceanFloor
      ) {
        reasons.push(
          `Near floor: ${point.distance_to_ocean_floor.toFixed(2)}m`
        );
      }

      // If we found issues, add to incidents
      if (reasons.length > 0) {
        foundIncidents.push({
          index: i,
          timestamp: point.timestamp_ros,
          latitude: point.latitude,
          longitude: point.longitude,
          depth: point.depth,
          roll: point.roll,
          pitch: point.pitch,
          yaw: point.yaw,
          error: point.errorState,
          distance_to_ocean_floor: point.distance_to_ocean_floor,
          reasons: reasons,
        });
      }
    }

    // Group nearby incidents by time (within 10 seconds)
    const groupedIncidents = [];
    const processedIndices = new Set();

    for (let i = 0; i < foundIncidents.length; i++) {
      if (processedIndices.has(i)) continue;

      const currentIncident = foundIncidents[i];
      const cluster = [currentIncident];
      processedIndices.add(i);

      // Find nearby incidents
      for (let j = 0; j < foundIncidents.length; j++) {
        if (i === j || processedIndices.has(j)) continue;

        const otherIncident = foundIncidents[j];
        const timeDiff = Math.abs(
          currentIncident.timestamp - otherIncident.timestamp
        );

        // If they're within 10 seconds, consider them part of the same event
        if (timeDiff < 10) {
          cluster.push(otherIncident);
          processedIndices.add(j);
        }
      }

      // Calculate average position for the cluster
      const avgLat =
        cluster.reduce((sum, inc) => sum + inc.latitude, 0) / cluster.length;
      const avgLng =
        cluster.reduce((sum, inc) => sum + inc.longitude, 0) / cluster.length;

      // Get the most common reasons for the incident
      const allReasons = cluster.flatMap((inc) => inc.reasons);
      const reasonCounts = {};
      allReasons.forEach((reason) => {
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      });

      // Sort by count
      const sortedReasons = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([reason]) => reason);

      // Add the cluster to our grouped incidents
      groupedIncidents.push({
        latitude: avgLat,
        longitude: avgLng,
        timestamp: currentIncident.timestamp,
        count: cluster.length,
        incidents: cluster,
        primaryReason: sortedReasons[0],
        allReasons: sortedReasons,
      });
    }

    return groupedIncidents;
  };

  // Function to get color for a depth value
  const getColorForDepth = (depth) => {
    const { min, max } = depthRange;
    const normalizedDepth = (depth - min) / (max - min);
    const lightness = 90 - normalizedDepth * 70;
    return `hsl(210, 100%, ${lightness}%)`;
  };

  // Function to map coordinates to SVG space
  const mapToSVG = (lat, long, width, height) => {
    const { minLat, maxLat, minLong, maxLong } = viewBox;

    // Flip the longitude mapping because SVG coordinates increase to the right
    const x = ((long - minLong) / (maxLong - minLong)) * width;
    // Flip the latitude mapping because SVG coordinates increase downward
    const y = height - ((lat - minLat) / (maxLat - minLat)) * height;

    return { x, y };
  };

  // Toggle attitude visualization
  const toggleAttitude = () => {
    setShowAttitude(!showAttitude);
  };

  if (loading) {
    return <div>Loading mission data...</div>;
  }

  if (error) {
    return <div style={{ color: "#dc2626" }}>{error}</div>;
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "20px",
      padding: "20px",
      maxWidth: "1200px",
      margin: "0 auto"
    }}>
      <h2 style={{
        fontSize: "24px",
        fontWeight: "bold",
        textAlign: "center",
        marginBottom: "20px"
      }}>
        Mission Path Visualization
      </h2>

      <div style={{ position: "relative", width: "100%", aspectRatio: "16/9" }}>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 1000 1000"
          style={{ border: "1px solid #ccc", borderRadius: "8px" }}
        >
          {/* Draw the actual path */}
          {actualData.map((point, index) => {
            if (index === 0) return null;
            const prev = actualData[index - 1];
            const start = mapToSVG(prev.latitude, prev.longitude, 1000, 1000);
            const end = mapToSVG(point.latitude, point.longitude, 1000, 1000);
            return (
              <line
                key={`path-${index}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={getColorForDepth(point.depth)}
                strokeWidth="2"
              />
            );
          })}

          {/* Draw the planned path */}
          {plannedData.map((point, index) => {
            if (index === 0) return null;
            const prev = plannedData[index - 1];
            const start = mapToSVG(prev.latitude, prev.longitude, 1000, 1000);
            const end = mapToSVG(point.latitude, point.longitude, 1000, 1000);
            return (
              <g key={`planned-${index}`}>
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="purple"
                  strokeWidth="1"
                  strokeDasharray="5,5"
                />
                <circle
                  cx={end.x}
                  cy={end.y}
                  r="4"
                  fill="purple"
                  onMouseEnter={() => {
                    setHoveredPoint(point);
                    setHoveredType("waypoint");
                  }}
                  onMouseLeave={() => {
                    setHoveredPoint(null);
                    setHoveredType(null);
                  }}
                />
              </g>
            );
          })}

          {/* Draw incident markers */}
          {incidents.map((incident, index) => {
            const pos = mapToSVG(incident.latitude, incident.longitude, 1000, 1000);
            return (
              <g key={`incident-${index}`}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r="8"
                  fill="red"
                  fillOpacity="0.5"
                  stroke="red"
                  strokeWidth="2"
                  onMouseEnter={() => {
                    setHoveredIncident(incident);
                    setHoveredType("incident");
                  }}
                  onMouseLeave={() => {
                    setHoveredIncident(null);
                    setHoveredType(null);
                  }}
                />
              </g>
            );
          })}
        </svg>

        {/* Tooltip for waypoints */}
        {hoveredPoint && hoveredType === "waypoint" && (
          <div
            style={{
              position: "absolute",
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              color: "white",
              padding: "8px",
              borderRadius: "4px",
              fontSize: "14px",
              top: "20px",
              left: "20px",
              pointerEvents: "none"
            }}
          >
            <div>Waypoint {hoveredPoint.waypoint_number}</div>
            <div>Lat: {hoveredPoint.latitude.toFixed(6)}</div>
            <div>Long: {hoveredPoint.longitude.toFixed(6)}</div>
          </div>
        )}

        {/* Tooltip for incidents */}
        {hoveredIncident && hoveredType === "incident" && (
          <div
            style={{
              position: "absolute",
              backgroundColor: "rgba(255, 0, 0, 0.8)",
              color: "white",
              padding: "8px",
              borderRadius: "4px",
              fontSize: "14px",
              top: "20px",
              left: "20px",
              pointerEvents: "none"
            }}
          >
            <div>Incident ({hoveredIncident.count} events)</div>
            <div>Primary: {hoveredIncident.primaryReason}</div>
            {hoveredIncident.allReasons.length > 1 && (
              <div>
                Other issues:
                <ul style={{ margin: "4px 0 0 20px", padding: 0 }}>
                  {hoveredIncident.allReasons.slice(1).map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{
        display: "flex",
        gap: "20px",
        justifyContent: "center",
        fontSize: "14px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "20px", height: "2px", backgroundColor: "blue" }} />
          <span>Actual Path</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "20px", height: "2px", backgroundColor: "purple", borderStyle: "dashed" }} />
          <span>Planned Path</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "8px", height: "8px", backgroundColor: "red", borderRadius: "50%" }} />
          <span>Incidents</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        display: "flex",
        gap: "10px",
        justifyContent: "center"
      }}>
        <button
          onClick={toggleAttitude}
          style={{
            padding: "8px 16px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            background: showAttitude ? "#e0e0e0" : "white",
            cursor: "pointer"
          }}
        >
          {showAttitude ? "Hide Attitude" : "Show Attitude"}
        </button>
      </div>
    </div>
  );
};

export default MissionPathWithIncidents;
