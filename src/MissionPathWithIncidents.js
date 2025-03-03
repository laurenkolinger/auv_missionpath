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
              <button style={styles.button} onClick={toggleAttitude}>
                {showAttitude ? "Hide Attitude" : "Show Attitude"}
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
              <div style={styles.legendItem}>
                <div
                  style={{ ...styles.legendDot, backgroundColor: "#ef4444" }}
                ></div>
                <span>Incidents ({incidents.length})</span>
              </div>
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

            {/* Draw actual path lines colored by depth */}
            {actualPoints.map((point, index) => {
              if (index === 0) return null;
              const prevPoint = actualPoints[index - 1];
              return (
                <line
                  key={`line-${index}`}
                  x1={prevPoint.x}
                  y1={prevPoint.y}
                  x2={point.x}
                  y2={point.y}
                  stroke={getColorForDepth(point.depth)}
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

            {/* Draw incident markers */}
            {incidentMarkers.map((marker, index) => (
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

            {/* Show attitude indicators if enabled */}
            {showAttitude &&
              actualPoints
                .filter((_, i) => i % 20 === 0)
                .map((point, index) => {
                  const originalPoint = point.original;
                  // Only show if we have valid attitude data
                  if (
                    originalPoint.roll === undefined ||
                    originalPoint.pitch === undefined
                  )
                    return null;

                  // Convert roll and pitch to radians
                  const rollRad = (originalPoint.roll * Math.PI) / 180;
                  const pitchRad = (originalPoint.pitch * Math.PI) / 180;

                  // Calculate line endpoints for roll and pitch indicators
                  const rollLength = 10;
                  const pitchLength = 10;

                  return (
                    <g key={`attitude-${index}`}>
                      {/* Roll indicator */}
                      <line
                        x1={point.x}
                        y1={point.y}
                        x2={point.x + rollLength * Math.sin(rollRad)}
                        y2={point.y + rollLength * Math.cos(rollRad)}
                        stroke="orange"
                        strokeWidth="1"
                      />
                      {/* Pitch indicator */}
                      <line
                        x1={point.x}
                        y1={point.y}
                        x2={point.x + pitchLength * Math.sin(pitchRad)}
                        y2={point.y - pitchLength * Math.cos(pitchRad)}
                        stroke="green"
                        strokeWidth="1"
                      />
                    </g>
                  );
                })}

            {/* Show tooltip for hovered actual point */}
            {hoveredPoint !== null &&
              hoveredType === "actual" &&
              actualPoints[hoveredPoint] && (
                <g>
                  <rect
                    x={actualPoints[hoveredPoint].x + 10}
                    y={actualPoints[hoveredPoint].y - 45}
                    width="160"
                    height="60"
                    fill="rgba(0, 0, 0, 0.8)"
                    rx="5"
                  />
                  <text
                    x={actualPoints[hoveredPoint].x + 15}
                    y={actualPoints[hoveredPoint].y - 30}
                    fill="white"
                    fontSize="12"
                  >
                    Depth: {actualPoints[hoveredPoint].depth.toFixed(2)}m
                  </text>
                  <text
                    x={actualPoints[hoveredPoint].x + 15}
                    y={actualPoints[hoveredPoint].y - 15}
                    fill="white"
                    fontSize="12"
                  >
                    Position:{" "}
                    {actualPoints[hoveredPoint].original.latitude.toFixed(6)},{" "}
                    {actualPoints[hoveredPoint].original.longitude.toFixed(6)}
                  </text>
                  <text
                    x={actualPoints[hoveredPoint].x + 15}
                    y={actualPoints[hoveredPoint].y}
                    fill="white"
                    fontSize="12"
                  >
                    Roll: {actualPoints[hoveredPoint].original.roll?.toFixed(2)}°
                    Pitch: {actualPoints[hoveredPoint].original.pitch?.toFixed(2)}
                    °
                  </text>
                </g>
              )}

            {/* Show tooltip for hovered planned point */}
            {hoveredPoint !== null &&
              hoveredType === "planned" &&
              plannedPoints[hoveredPoint] && (
                <g>
                  <rect
                    x={plannedPoints[hoveredPoint].x + 10}
                    y={plannedPoints[hoveredPoint].y - 60}
                    width="200"
                    height="55"
                    fill="rgba(0, 0, 0, 0.8)"
                    rx="5"
                  />
                  <text
                    x={plannedPoints[hoveredPoint].x + 15}
                    y={plannedPoints[hoveredPoint].y - 40}
                    fill="white"
                    fontSize="12"
                  >
                    Waypoint:{" "}
                    {plannedPoints[hoveredPoint].original.waypoint_number}
                  </text>
                  <text
                    x={plannedPoints[hoveredPoint].x + 15}
                    y={plannedPoints[hoveredPoint].y - 25}
                    fill="white"
                    fontSize="12"
                  >
                    Position:{" "}
                    {plannedPoints[hoveredPoint].original.latitude.toFixed(6)},{" "}
                    {plannedPoints[hoveredPoint].original.longitude.toFixed(6)}
                  </text>
                  <text
                    x={plannedPoints[hoveredPoint].x + 15}
                    y={plannedPoints[hoveredPoint].y - 10}
                    fill="white"
                    fontSize="12"
                  >
                    Type:{" "}
                    {
                      plannedPoints[hoveredPoint].original.additional_data
                        .transect_type
                    }
                  </text>
                </g>
              )}

            {/* Show tooltip for hovered incident */}
            {hoveredIncident !== null && incidentMarkers[hoveredIncident] && (
              <g>
                <rect
                  x={incidentMarkers[hoveredIncident].x + 10}
                  y={incidentMarkers[hoveredIncident].y - 80}
                  width="220"
                  height={Math.min(
                    80,
                    25 +
                      incidentMarkers[hoveredIncident].incident.allReasons
                        .length *
                        15
                  )}
                  fill="rgba(255, 0, 0, 0.8)"
                  rx="5"
                />
                <text
                  x={incidentMarkers[hoveredIncident].x + 15}
                  y={incidentMarkers[hoveredIncident].y - 60}
                  fill="white"
                  fontSize="12"
                  fontWeight="bold"
                >
                  INCIDENT ({incidentMarkers[hoveredIncident].incident.count}{" "}
                  events)
                </text>
                {incidentMarkers[hoveredIncident].incident.allReasons
                  .slice(0, 3)
                  .map((reason, i) => (
                    <text
                      key={`reason-${i}`}
                      x={incidentMarkers[hoveredIncident].x + 15}
                      y={incidentMarkers[hoveredIncident].y - 45 + i * 15}
                      fill="white"
                      fontSize="12"
                    >
                      • {reason}
                    </text>
                  ))}
              </g>
            )}
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