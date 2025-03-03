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
  const [showIncidents, setShowIncidents] = useState(true);

  // New state variables for data toggles
  const [showAttitudeIndicators, setShowAttitudeIndicators] = useState(true);
  const [showVelocity, setShowVelocity] = useState(false);
  const [showModes, setShowModes] = useState(false);
  const [showDepthMetrics, setShowDepthMetrics] = useState(false);
  const [showBattery, setShowBattery] = useState(false);
  const [showFoundObjects, setShowFoundObjects] = useState(false);
  
  // State for ranges of continuous variables
  const [velocityRange, setVelocityRange] = useState({ min: 0, max: 0 });
  const [batteryRange, setBatteryRange] = useState({ min: 0, max: 0 });
  const [altimeterRange, setAltimeterRange] = useState({ min: 0, max: 0 });

  // Color scales for discrete values
  const modeColors = {
    0: "#4CAF50", // Normal
    1: "#FFC107", // Warning
    2: "#F44336", // Error
  };

  // Function to get color for velocity magnitude
  const getColorForVelocity = (velX, velY, velZ) => {
    const magnitude = Math.sqrt(velX * velX + velY * velY + velZ * velZ);
    const { min, max } = velocityRange;
    const normalizedVel = (magnitude - min) / (max - min);
    return `hsl(${200 + normalizedVel * 160}, 100%, 50%)`;
  };

  // Function to get color for battery level
  const getColorForBattery = (volts) => {
    const { min, max } = batteryRange;
    const normalizedBattery = (volts - min) / (max - min);
    return `hsl(${normalizedBattery * 120}, 100%, 50%)`; // Red to Green
  };

  // Function to get color for altimeter reading
  const getColorForAltimeter = (alt) => {
    const { min, max } = altimeterRange;
    const normalizedAlt = (alt - min) / (max - min);
    return `hsl(280, ${normalizedAlt * 100}%, 50%)`; // Purple gradient
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        console.log("Starting to load data...");

        // Load mission path data
        console.log("Fetching CSV...");
        const csvResponse = await fetch(missionCsvPath);
        if (!csvResponse.ok) {
          throw new Error(`Failed to load CSV: ${csvResponse.status} ${csvResponse.statusText}`);
        }
        const csvText = await csvResponse.text();
        console.log("CSV loaded, length:", csvText.length);

        // Parse CSV data
        const parsedResults = Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });

        // Filter out any rows with null coordinates or depth
        const validData = parsedResults.data.filter(
          (row) =>
            row.latitude !== null &&
            row.longitude !== null &&
            row.depth !== null
        );

        // Calculate ranges for continuous variables
        const velocities = validData.map(row => 
          Math.sqrt(row.velX * row.velX + row.velY * row.velY + row.velZ * row.velZ)
        );
        setVelocityRange({
          min: Math.min(...velocities),
          max: Math.max(...velocities)
        });

        const batteries = validData.map(row => row.battery_volts);
        setBatteryRange({
          min: Math.min(...batteries),
          max: Math.max(...batteries)
        });

        const altitudes = validData.map(row => row.acousticAltimeter);
        setAltimeterRange({
          min: Math.min(...altitudes),
          max: Math.max(...altitudes)
        });

        console.log(`Parsed ${validData.length} valid data points`);

        // Load planned mission data
        console.log("Fetching JSON...");
        const jsonResponse = await fetch(missionJsonPath);
        if (!jsonResponse.ok) {
          throw new Error(`Failed to load JSON: ${jsonResponse.status} ${jsonResponse.statusText}`);
        }
        const missionData = await jsonResponse.json();
        console.log("JSON loaded:", missionData.mission_summary?.mission_name);

        // Sample the data to avoid rendering too many points if it's large
        const sampleRate = Math.ceil(validData.length / 2000);
        const sampledData = validData.filter(
          (_, index) => index % sampleRate === 0
        );

        // Calculate depth range for color mapping
        const depthValues = sampledData.map((row) => row.depth);
        const minDepth = Math.min(...depthValues);
        const maxDepth = Math.max(...depthValues);
        setDepthRange({ min: minDepth, max: maxDepth });

        // Detect incidents
        const detectedIncidents = detectIncidents(validData);
        setIncidents(detectedIncidents);

        // Calculate the geographic bounds
        const actualLats = sampledData.map((row) => row.latitude);
        const actualLongs = sampledData.map((row) => row.longitude);
        const plannedLats = missionData.waypoints.map((wp) => wp.latitude);
        const plannedLongs = missionData.waypoints.map((wp) => wp.longitude);

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

        setActualData(sampledData);
        setPlannedData(missionData.waypoints);
        setLoading(false);
      } catch (err) {
        console.error("Error in loadData:", err);
        setError(`Error loading or processing data: ${err.message}`);
        setLoading(false);
      }
    };

    loadData();
  }, [missionJsonPath, missionCsvPath]);

  // Function to detect incidents in the data
  const detectIncidents = (data) => {
    const thresholds = {
      roll: 45,
      pitch: 45,
      depthChange: 1.0,
      errorState: 0,
      minDistanceToOceanFloor: 0.5,
    };

    const foundIncidents = [];
    for (let i = 0; i < data.length; i++) {
      const point = data[i];
      
      // Skip points with missing critical data
      if (!point.timestamp_ros) continue;

      const reasons = [];

      // Check for extreme attitude values if they exist
      if (point.roll !== undefined && Math.abs(point.roll) > thresholds.roll) {
        reasons.push(`Extreme roll: ${point.roll.toFixed(2)}°`);
      }

      if (point.pitch !== undefined && Math.abs(point.pitch) > thresholds.pitch) {
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
        reasons.push(`Near floor: ${point.distance_to_ocean_floor.toFixed(2)}m`);
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

    // Group nearby incidents by time (within 5 seconds instead of 10)
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
        const timeDiff = Math.abs(currentIncident.timestamp - otherIncident.timestamp);

        if (timeDiff < 5) { // Reduced from 10 to 5 seconds for tighter clustering
          cluster.push(otherIncident);
          processedIndices.add(j);
        }
      }

      // Calculate average position for the cluster
      const avgLat = cluster.reduce((sum, inc) => sum + inc.latitude, 0) / cluster.length;
      const avgLng = cluster.reduce((sum, inc) => sum + inc.longitude, 0) / cluster.length;

      // Get the most common reasons
      const allReasons = cluster.flatMap((inc) => inc.reasons);
      const reasonCounts = {};
      allReasons.forEach((reason) => {
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      });

      const sortedReasons = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([reason]) => reason);

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

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "300px",
          gap: "20px",
        }}
      >
        <div>Loading mission data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: "16px",
          color: "#d32f2f",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <div>{error}</div>
      </div>
    );
  }

  const svgWidth = 800;
  const svgHeight = 600;

  // Create the actual path points
  const actualPoints = actualData.map((point, index) => {
    const { x, y } = mapToSVG(
      point.latitude,
      point.longitude,
      svgWidth,
      svgHeight
    );
    return { x, y, depth: point.depth, original: point, index };
  });

  // Create the planned path points
  const plannedPoints = plannedData.map((point, index) => {
    const { x, y } = mapToSVG(
      point.latitude,
      point.longitude,
      svgWidth,
      svgHeight
    );
    return { x, y, original: point, index };
  });

  // Create the incident markers
  const incidentMarkers = incidents.map((incident, index) => {
    const { x, y } = mapToSVG(
      incident.latitude,
      incident.longitude,
      svgWidth,
      svgHeight
    );
    return { x, y, incident, index };
  });

  // Define some inline styles (for compatibility)
  const styles = {
    container: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "16px",
    },
    title: {
      fontSize: "1.25rem",
      fontWeight: "bold",
      marginBottom: "16px",
    },
    card: {
      backgroundColor: "white",
      padding: "16px",
      borderRadius: "8px",
      boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
      width: "100%",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: "16px",
    },
    buttonContainer: {
      display: "flex",
      gap: "8px",
    },
    button: {
      backgroundColor: "#3b82f6",
      color: "white",
      fontWeight: "bold",
      padding: "4px 8px",
      borderRadius: "4px",
      fontSize: "0.875rem",
      border: "none",
      cursor: "pointer",
    },
    legendContainer: {
      display: "flex",
      gap: "16px",
    },
    legendItem: {
      display: "flex",
      alignItems: "center",
    },
    legendDot: {
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      marginRight: "8px",
    },
    legendLine: {
      width: "16px",
      height: "0",
      borderTop: "2px dashed purple",
      marginRight: "8px",
    },
    svgContainer: {
      backgroundColor: "#f9fafb",
      width: "100%",
      height: svgHeight,
    },
    depthLegend: {
      marginTop: "16px",
    },
    legendTitle: {
      fontSize: "1.125rem",
      fontWeight: "600",
      marginBottom: "8px",
    },
    depthBar: {
      display: "flex",
      alignItems: "center",
      width: "100%",
      height: "32px",
      background: "linear-gradient(to right, #dbeafe, #1e3a8a)",
      borderRadius: "4px",
    },
    depthLabels: {
      display: "flex",
      justifyContent: "space-between",
      marginTop: "4px",
    },
    statsGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "16px",
      marginTop: "24px",
      fontSize: "0.875rem",
    },
    statsCard: (color) => ({
      padding: "12px",
      borderRadius: "4px",
      backgroundColor: color,
    }),
    statsTitle: {
      fontWeight: "bold",
      marginBottom: "8px",
    },
    incidentTable: {
      marginTop: "16px",
      backgroundColor: "#f9fafb",
      padding: "12px",
      borderRadius: "4px",
    },
    table: {
      width: "100%",
      fontSize: "0.75rem",
      borderCollapse: "collapse",
    },
    tableHead: {
      textAlign: "left",
      padding: "4px",
    },
    tableRow: (isEven) => ({
      backgroundColor: isEven ? "#f3f4f6" : "transparent",
    }),
    tableCell: {
      padding: "4px",
    },
    footer: {
      marginTop: "16px",
      fontSize: "0.75rem",
      color: "#6b7280",
    },
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Mission Path with Incidents and Planned Route</h2>

      {error && (
        <div style={{
          padding: "12px",
          backgroundColor: "#fee2e2",
          color: "#dc2626",
          borderRadius: "4px",
          marginBottom: "16px",
        }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{
          padding: "20px",
          textAlign: "center",
        }}>
          Loading mission data...
        </div>
      )}

      {!loading && !error && (
        <div style={styles.card}>
          <div style={styles.header}>
            <div style={styles.buttonContainer}>
              <button 
                style={{...styles.button, backgroundColor: showIncidents ? "#3b82f6" : "#9ca3af"}} 
                onClick={() => setShowIncidents(!showIncidents)}
              >
                {showIncidents ? "Hide Incidents" : "Show Incidents"}
              </button>
              <button 
                style={{...styles.button, backgroundColor: showAttitudeIndicators ? "#3b82f6" : "#9ca3af"}} 
                onClick={() => setShowAttitudeIndicators(!showAttitudeIndicators)}
              >
                {showAttitudeIndicators ? "Hide Attitude" : "Show Attitude"}
              </button>
              <button 
                style={{...styles.button, backgroundColor: showVelocity ? "#3b82f6" : "#9ca3af"}} 
                onClick={() => setShowVelocity(!showVelocity)}
              >
                {showVelocity ? "Hide Velocity" : "Show Velocity"}
              </button>
              <button 
                style={{...styles.button, backgroundColor: showModes ? "#3b82f6" : "#9ca3af"}} 
                onClick={() => setShowModes(!showModes)}
              >
                {showModes ? "Hide Modes" : "Show Modes"}
              </button>
              <button 
                style={{...styles.button, backgroundColor: showDepthMetrics ? "#3b82f6" : "#9ca3af"}} 
                onClick={() => setShowDepthMetrics(!showDepthMetrics)}
              >
                {showDepthMetrics ? "Hide Depth Metrics" : "Show Depth Metrics"}
              </button>
              <button 
                style={{...styles.button, backgroundColor: showBattery ? "#3b82f6" : "#9ca3af"}} 
                onClick={() => setShowBattery(!showBattery)}
              >
                {showBattery ? "Hide Battery" : "Show Battery"}
              </button>
              <button 
                style={{...styles.button, backgroundColor: showFoundObjects ? "#3b82f6" : "#9ca3af"}} 
                onClick={() => setShowFoundObjects(!showFoundObjects)}
              >
                {showFoundObjects ? "Hide Found Objects" : "Show Found Objects"}
              </button>
            </div>
            <div style={styles.legendContainer}>
              <div style={styles.legendItem}>
                <div
                  style={{ ...styles.legendDot, backgroundColor: "#3b82f6" }}
                ></div>
                <span>Actual Path</span>
              </div>
              <div style={styles.legendItem}>
                <div style={styles.legendLine}></div>
                <span>Planned Route</span>
              </div>
              {showIncidents && (
                <div style={styles.legendItem}>
                  <div
                    style={{ ...styles.legendDot, backgroundColor: "#ef4444" }}
                  ></div>
                  <span>Incidents ({incidents.length})</span>
                </div>
              )}
            </div>
          </div>

          <svg
            width="100%"
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={styles.svgContainer}
          >
            {/* Draw planned path as dotted line */}
            <path
              d={plannedPoints
                .map((point, i) => `${i === 0 ? "M" : "L"} ${point.x},${point.y}`)
                .join(" ")}
              fill="none"
              stroke="purple"
              strokeWidth="2"
              strokeDasharray="5,5"
              strokeOpacity="0.8"
            />

            {/* Draw actual path lines with selected visualization */}
            {actualPoints.map((point, index) => {
              if (index === 0) return null;
              const prevPoint = actualPoints[index - 1];
              const currentData = point.original;
              const prevData = prevPoint.original;

              let strokeColor = getColorForDepth(point.depth);
              
              if (showVelocity) {
                strokeColor = getColorForVelocity(
                  currentData.velX,
                  currentData.velY,
                  currentData.velZ
                );
              } else if (showBattery) {
                strokeColor = getColorForBattery(currentData.battery_volts);
              } else if (showDepthMetrics && currentData.acousticAltimeter) {
                strokeColor = getColorForAltimeter(currentData.acousticAltimeter);
              } else if (showModes) {
                strokeColor = modeColors[currentData.navMode] || "#999";
              }

              return (
                <line
                  key={`line-${index}`}
                  x1={prevPoint.x}
                  y1={prevPoint.y}
                  x2={point.x}
                  y2={point.y}
                  stroke={strokeColor}
                  strokeWidth="2"
                />
              );
            })}

            {/* Draw actual path points */}
            {actualPoints.map((point, index) => (
              <circle
                key={`actual-point-${index}`}
                cx={point.x}
                cy={point.y}
                r="2"
                fill={getColorForDepth(point.depth)}
                stroke={
                  hoveredPoint === index && hoveredType === "actual"
                    ? "#000"
                    : "none"
                }
                strokeWidth="1"
                onMouseEnter={() => {
                  setHoveredPoint(index);
                  setHoveredType("actual");
                }}
                onMouseLeave={() => {
                  setHoveredPoint(null);
                  setHoveredType(null);
                }}
              />
            ))}

            {/* Draw planned waypoints */}
            {plannedPoints.map((point, index) => (
              <React.Fragment key={`planned-waypoint-${index}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  fill="purple"
                  fillOpacity="0.6"
                  stroke={
                    hoveredPoint === index && hoveredType === "planned"
                      ? "#000"
                      : "none"
                  }
                  strokeWidth="1"
                  onMouseEnter={() => {
                    setHoveredPoint(index);
                    setHoveredType("planned");
                  }}
                  onMouseLeave={() => {
                    setHoveredPoint(null);
                    setHoveredType(null);
                  }}
                />
                <text
                  x={point.x + 5}
                  y={point.y - 5}
                  fontSize="10"
                  fill="purple"
                  fontWeight="bold"
                  opacity="0.8"
                >
                  {index + 1}
                </text>
              </React.Fragment>
            ))}

            {/* Draw incident markers if enabled */}
            {showIncidents && incidentMarkers.map((marker, index) => (
              <g
                key={`incident-${index}`}
                onMouseEnter={() => {
                  setHoveredIncident(index);
                }}
                onMouseLeave={() => {
                  setHoveredIncident(null);
                }}
              >
                <circle
                  cx={marker.x}
                  cy={marker.y}
                  r="8"
                  fill="red"
                  fillOpacity="0.7"
                  stroke="white"
                  strokeWidth="1"
                />
                <text
                  x={marker.x}
                  y={marker.y + 4}
                  fontSize="10"
                  fill="white"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  {marker.incident.count > 9 ? "!" : marker.incident.count}
                </text>
              </g>
            ))}

            {/* Draw attitude indicators every 10 points if enabled */}
            {showAttitudeIndicators && actualPoints.map((point, index) => {
              const originalPoint = point.original;
              if (
                originalPoint.roll === undefined ||
                originalPoint.pitch === undefined ||
                index % 10 !== 0
              )
                return null;

              const rollRad = (originalPoint.roll * Math.PI) / 180;
              const pitchRad = (originalPoint.pitch * Math.PI) / 180;
              const rollLength = 20;
              const pitchLength = 20;

              return (
                <g key={`attitude-${index}`}>
                  <line
                    x1={point.x}
                    y1={point.y}
                    x2={point.x + rollLength * Math.sin(rollRad)}
                    y2={point.y + rollLength * Math.cos(rollRad)}
                    stroke="orange"
                    strokeWidth="2"
                    strokeOpacity="0.7"
                  />
                  <line
                    x1={point.x}
                    y1={point.y}
                    x2={point.x + pitchLength * Math.sin(pitchRad)}
                    y2={point.y - pitchLength * Math.cos(pitchRad)}
                    stroke="green"
                    strokeWidth="2"
                    strokeOpacity="0.7"
                  />
                </g>
              );
            })}

            {/* Draw found objects markers if enabled */}
            {showFoundObjects && actualPoints.map((point, index) => {
              const data = point.original;
              if (!data.cotsNumFound && !data.cotsNumMaybe) return null;

              return (
                <g key={`found-${index}`}>
                  {data.cotsNumFound > 0 && (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="6"
                      fill="#ff4081"
                      fillOpacity="0.7"
                      stroke="white"
                      strokeWidth="1"
                    />
                  )}
                  {data.cotsNumMaybe > 0 && (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="4"
                      fill="#ff9800"
                      fillOpacity="0.7"
                      stroke="white"
                      strokeWidth="1"
                    />
                  )}
                </g>
              );
            })}

            {/* Update tooltip content based on active visualizations */}
            {hoveredPoint !== null && hoveredType === "actual" && actualPoints[hoveredPoint] && (
              <g>
                <rect
                  x={actualPoints[hoveredPoint].x + 10}
                  y={actualPoints[hoveredPoint].y - 120}
                  width="200"
                  height="110"
                  fill="rgba(0, 0, 0, 0.8)"
                  rx="5"
                />
                <text
                  x={actualPoints[hoveredPoint].x + 15}
                  y={actualPoints[hoveredPoint].y - 100}
                  fill="white"
                  fontSize="12"
                >
                  Depth: {actualPoints[hoveredPoint].depth.toFixed(2)}m
                </text>
                {showVelocity && (
                  <text
                    x={actualPoints[hoveredPoint].x + 15}
                    y={actualPoints[hoveredPoint].y - 85}
                    fill="white"
                    fontSize="12"
                  >
                    Velocity: {Math.sqrt(
                      Math.pow(actualPoints[hoveredPoint].original.velX, 2) +
                      Math.pow(actualPoints[hoveredPoint].original.velY, 2) +
                      Math.pow(actualPoints[hoveredPoint].original.velZ, 2)
                    ).toFixed(2)} m/s
                  </text>
                )}
                {showModes && (
                  <text
                    x={actualPoints[hoveredPoint].x + 15}
                    y={actualPoints[hoveredPoint].y - 70}
                    fill="white"
                    fontSize="12"
                  >
                    Mode: {actualPoints[hoveredPoint].original.navMode}
                  </text>
                )}
                {showDepthMetrics && (
                  <text
                    x={actualPoints[hoveredPoint].x + 15}
                    y={actualPoints[hoveredPoint].y - 55}
                    fill="white"
                    fontSize="12"
                  >
                    Altimeter: {actualPoints[hoveredPoint].original.acousticAltimeter?.toFixed(2)}m
                  </text>
                )}
                {showBattery && (
                  <text
                    x={actualPoints[hoveredPoint].x + 15}
                    y={actualPoints[hoveredPoint].y - 40}
                    fill="white"
                    fontSize="12"
                  >
                    Battery: {actualPoints[hoveredPoint].original.battery_volts?.toFixed(2)}V
                  </text>
                )}
                {showFoundObjects && (
                  <text
                    x={actualPoints[hoveredPoint].x + 15}
                    y={actualPoints[hoveredPoint].y - 25}
                    fill="white"
                    fontSize="12"
                  >
                    Found: {actualPoints[hoveredPoint].original.cotsNumFound || 0}
                    Maybe: {actualPoints[hoveredPoint].original.cotsNumMaybe || 0}
                  </text>
                )}
              </g>
            )}

            {/* Add dynamic legend based on active visualizations */}
            <g transform={`translate(${svgWidth - 150}, 20)`}>
              {showVelocity && (
                <g>
                  <text x="0" y="15" fontSize="12" fill="#666">Velocity (m/s):</text>
                  <rect x="0" y="20" width="100" height="10" fill="url(#velocityGradient)" />
                  <text x="0" y="45" fontSize="10" fill="#666">{velocityRange.min.toFixed(1)}</text>
                  <text x="80" y="45" fontSize="10" fill="#666">{velocityRange.max.toFixed(1)}</text>
                </g>
              )}
              {showBattery && (
                <g transform="translate(0, 60)">
                  <text x="0" y="15" fontSize="12" fill="#666">Battery (V):</text>
                  <rect x="0" y="20" width="100" height="10" fill="url(#batteryGradient)" />
                  <text x="0" y="45" fontSize="10" fill="#666">{batteryRange.min.toFixed(1)}</text>
                  <text x="80" y="45" fontSize="10" fill="#666">{batteryRange.max.toFixed(1)}</text>
                </g>
              )}
              {showModes && (
                <g transform="translate(0, 120)">
                  <text x="0" y="15" fontSize="12" fill="#666">Nav Modes:</text>
                  {Object.entries(modeColors).map(([mode, color], i) => (
                    <g key={mode} transform={`translate(0, ${20 + i * 20})`}>
                      <rect x="0" y="0" width="10" height="10" fill={color} />
                      <text x="15" y="9" fontSize="10" fill="#666">Mode {mode}</text>
                    </g>
                  ))}
                </g>
              )}
            </g>

            {/* Add gradients for continuous variables */}
            <defs>
              <linearGradient id="velocityGradient">
                <stop offset="0%" stopColor="hsl(200, 100%, 50%)" />
                <stop offset="100%" stopColor="hsl(360, 100%, 50%)" />
              </linearGradient>
              <linearGradient id="batteryGradient">
                <stop offset="0%" stopColor="hsl(0, 100%, 50%)" />
                <stop offset="100%" stopColor="hsl(120, 100%, 50%)" />
              </linearGradient>
            </defs>
          </svg>

          {/* Depth legend */}
          <div style={styles.depthLegend}>
            <h3 style={styles.legendTitle}>Depth Scale</h3>
            <div style={styles.depthBar}></div>
            <div style={styles.depthLabels}>
              <span style={{ fontSize: "0.875rem" }}>
                {depthRange.min.toFixed(2)} m (Shallow)
              </span>
              <span style={{ fontSize: "0.875rem" }}>
                {((depthRange.min + depthRange.max) / 2).toFixed(2)} m
              </span>
              <span style={{ fontSize: "0.875rem" }}>
                {depthRange.max.toFixed(2)} m (Deep)
              </span>
            </div>
          </div>

          {/* Mission statistics and incident summary */}
          <div style={styles.statsGrid}>
            <div style={styles.statsCard("#eff6ff")}>
              <h3 style={styles.statsTitle}>Actual Path</h3>
              <p>
                <strong>Data Points:</strong> {actualData.length}
              </p>
              <p>
                <strong>Depth Range:</strong> {depthRange.min.toFixed(2)} -{" "}
                {depthRange.max.toFixed(2)} m
              </p>
            </div>

            <div style={styles.statsCard("#f5f3ff")}>
              <h3 style={styles.statsTitle}>Planned Route</h3>
              <p>
                <strong>Waypoints:</strong> {plannedData.length}
              </p>
            </div>

            <div style={styles.statsCard("#fee2e2")}>
              <h3 style={styles.statsTitle}>Incidents</h3>
              <p>
                <strong>Total Incidents:</strong> {incidents.length} clusters
              </p>
            </div>
          </div>

          {/* Incident details */}
          {incidents.length > 0 && (
            <div style={styles.incidentTable}>
              <h3 style={styles.statsTitle}>Incident Details</h3>
              <div style={{ maxHeight: "160px", overflow: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.tableHead}>Location</th>
                      <th style={styles.tableHead}>Events</th>
                      <th style={styles.tableHead}>Primary Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((incident, i) => (
                      <tr
                        key={`incident-row-${i}`}
                        style={styles.tableRow(i % 2 === 0)}
                      >
                        <td style={styles.tableCell}>
                          {incident.latitude.toFixed(6)},{" "}
                          {incident.longitude.toFixed(6)}
                        </td>
                        <td style={styles.tableCell}>{incident.count}</td>
                        <td style={styles.tableCell}>{incident.primaryReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={styles.footer}>
            Hover over points to see detailed information. The actual path is
            colored from light blue (shallow) to dark blue (deep), while the
            planned route is shown as a purple dotted line with numbered
            waypoints. Red circles indicate incident clusters.
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionPathWithIncidents;