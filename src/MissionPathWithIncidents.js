import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import _ from "lodash";
import { format, parseISO } from 'date-fns';

const MissionPathWithIncidents = ({ missionJsonPath, missionCsvPath, usblPath }) => {
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
  const [showIncidents, setShowIncidents] = useState(false);
  const [missionName, setMissionName] = useState("");
  const [timeRange, setTimeRange] = useState({ start: "", end: "" });

  // New state variables for USBL data
  const [usblData, setUsblData] = useState([]);
  const [showUsblTrack, setShowUsblTrack] = useState(false);

  // New state variables for data toggles
  const [showAttitudeIndicators, setShowAttitudeIndicators] = useState(false);

  // State for ranges of continuous variables
  const [velocityRange, setVelocityRange] = useState({ min: 0, max: 0 });
  const [batteryRange, setBatteryRange] = useState({ min: 0, max: 0 });
  const [altimeterRange, setAltimeterRange] = useState({ min: 0, max: 0 });

  // New state variables for points visibility
  const [showDepthPoints, setShowDepthPoints] = useState(false);
  const [showVelocityPoints, setShowVelocityPoints] = useState(false);
  const [showModePoints, setShowModePoints] = useState(false);
  const [showBatteryPoints, setShowBatteryPoints] = useState(false);
  const [showAltimeterPoints, setShowAltimeterPoints] = useState(false);
  const [showBasePoints, setShowBasePoints] = useState(true);

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

  // Function to format time only (HH:MM:SS)
  const formatTimeOnly = (timestamp) => {
    if (!timestamp || typeof timestamp !== 'string') return "00:00:00";
    try {
      // Parse the timestamp (YYYYMMDDHHmmss.ffffff format)
      const timeStr = timestamp.split('.')[0]; // Remove microseconds
      if (timeStr.length < 14) return "00:00:00";

      const hours = timeStr.substring(8, 10);
      const minutes = timeStr.substring(10, 12);
      const seconds = timeStr.substring(12, 14);

      return `${hours}:${minutes}:${seconds}`;
    } catch (error) {
      console.error('Error formatting time:', error, 'timestamp:', timestamp);
      return "00:00:00";
    }
  };

  // Function to format date only (d Month YYYY)
  const formatDateOnly = (timestamp) => {
    if (!timestamp || typeof timestamp !== 'string') return "1 January 2025";
    try {
      // Parse the timestamp (YYYYMMDDHHmmss.ffffff format)
      const timeStr = timestamp.split('.')[0]; // Remove microseconds
      if (timeStr.length < 14) return "1 January 2025";

      const year = timeStr.substring(0, 4);
      const month = parseInt(timeStr.substring(4, 6)) - 1; // JS months are 0-based
      const day = timeStr.substring(6, 8);

      const date = new Date(year, month, day);
      return format(date, 'd MMMM yyyy');
    } catch (error) {
      console.error('Error formatting date:', error, 'timestamp:', timestamp);
      return "1 January 2025";
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        console.log("Starting to load data...");

        // Load USBL data
        console.log("Loading USBL data...");
        const usblResponse = await fetch(usblPath);
        if (!usblResponse.ok) {
          throw new Error(`Failed to load USBL data: ${usblResponse.status} ${usblResponse.statusText}`);
        }
        const usblText = await usblResponse.text();
        
        // Parse USBL CSV data
        const usblResults = Papa.parse(usblText, {
          skipEmptyLines: true,
          dynamicTyping: true,
        });

        // Process USBL data - format: timestamp,id,lat,long,depth,something,incident
        const processedUsblData = usblResults.data.map(row => ({
          timestamp: row[0],
          latitude: row[2],
          longitude: row[3],
          depth: row[4],
        })).filter(row => row.latitude && row.longitude && row.depth);

        setUsblData(processedUsblData);

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

        // Get time range from timestamp_sys
        const timeStamps = parsedResults.data
          .map(row => row.timestamp_sys)
          .filter(Boolean)
          .sort();
        
        if (timeStamps.length > 0) {
          setTimeRange({
            start: timeStamps[0],
            end: timeStamps[timeStamps.length - 1]
          });
        }

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
        const usblDepths = processedUsblData.map(row => row.depth);
        const allDepths = [...depthValues, ...usblDepths];
        const minDepth = Math.min(...allDepths);
        const maxDepth = Math.max(...allDepths);
        setDepthRange({ min: minDepth, max: maxDepth });

        // Detect incidents
        const detectedIncidents = detectIncidents(validData);
        setIncidents(detectedIncidents);

        // Calculate the geographic bounds
        const actualLats = sampledData.map((row) => row.latitude);
        const actualLongs = sampledData.map((row) => row.longitude);
        const plannedLats = missionData.waypoints.map((wp) => wp.latitude);
        const plannedLongs = missionData.waypoints.map((wp) => wp.longitude);
        const usblLats = processedUsblData.map((row) => row.latitude);
        const usblLongs = processedUsblData.map((row) => row.longitude);

        const allLats = [...actualLats, ...plannedLats, ...usblLats];
        const allLongs = [...actualLongs, ...plannedLongs, ...usblLongs];

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

        // Load mission name from JSON
        setMissionName(missionData.mission_summary?.mission_name || "Mission");
      } catch (err) {
        console.error("Error in loadData:", err);
        setError(`Error loading or processing data: ${err.message}`);
        setLoading(false);
      }
    };

    loadData();
  }, [missionJsonPath, missionCsvPath, usblPath]);

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
      fontSize: "1.5rem",
      fontWeight: "bold",
      marginBottom: "24px",
      color: "#1e293b",
      textAlign: "center",
      lineHeight: "1.4",
    },
    card: {
      backgroundColor: "white",
      padding: "16px",
      borderRadius: "8px",
      boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
      width: "100%",
    },
    buttonContainer: {
      display: "flex",
      gap: "8px",
      flexWrap: "wrap",
      justifyContent: "center",
      marginBottom: "16px",
    },
    button: {
      backgroundColor: "#3b82f6",
      color: "white",
      fontWeight: "500",
      padding: "6px 12px",
      borderRadius: "6px",
      fontSize: "0.875rem",
      border: "none",
      cursor: "pointer",
      transition: "all 0.2s ease",
      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
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
    legendsContainer: {
      display: "flex",
      flexDirection: "column",
      gap: "24px",
      padding: "24px",
      backgroundColor: "#f8fafc",
      borderRadius: "8px",
      marginTop: "24px",
    },
    legendRow: {
      display: "flex",
      gap: "32px",
      justifyContent: "center",
      alignItems: "center",
    },
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>
        {missionName}
        <div style={{ fontSize: "1rem", color: "#64748b", marginTop: "4px" }}>
          {formatDateOnly(timeRange.start)}
        </div>
        <div style={{ fontSize: "1rem", color: "#64748b", marginTop: "4px" }}>
          {formatTimeOnly(timeRange.start)} - {formatTimeOnly(timeRange.end)}
        </div>
      </h2>

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
          <div style={styles.buttonContainer}>
            <button 
              style={{
                ...styles.button,
                backgroundColor: showIncidents ? "#3b82f6" : "#e2e8f0",
                color: showIncidents ? "white" : "#64748b",
              }}
              onClick={() => setShowIncidents(!showIncidents)}
            >
              {showIncidents ? "Hide Incidents" : "Show Incidents"}
            </button>
            <button 
              style={{
                ...styles.button,
                backgroundColor: showAttitudeIndicators ? "#3b82f6" : "#e2e8f0",
                color: showAttitudeIndicators ? "white" : "#64748b",
              }}
              onClick={() => setShowAttitudeIndicators(!showAttitudeIndicators)}
            >
              {showAttitudeIndicators ? "Hide Attitude" : "Show Attitude"}
            </button>
            <button 
              style={{
                ...styles.button,
                backgroundColor: showDepthPoints ? "#3b82f6" : "#e2e8f0",
                color: showDepthPoints ? "white" : "#64748b",
              }}
              onClick={() => setShowDepthPoints(!showDepthPoints)}
            >
              {showDepthPoints ? "Hide Depth Points" : "Show Depth Points"}
            </button>
            <button 
              style={{
                ...styles.button,
                backgroundColor: showVelocityPoints ? "#3b82f6" : "#e2e8f0",
                color: showVelocityPoints ? "white" : "#64748b",
              }}
              onClick={() => setShowVelocityPoints(!showVelocityPoints)}
            >
              {showVelocityPoints ? "Hide Velocity Points" : "Show Velocity Points"}
            </button>
            <button 
              style={{
                ...styles.button,
                backgroundColor: showModePoints ? "#3b82f6" : "#e2e8f0",
                color: showModePoints ? "white" : "#64748b",
              }}
              onClick={() => setShowModePoints(!showModePoints)}
            >
              {showModePoints ? "Hide Mode Points" : "Show Mode Points"}
            </button>
            <button 
              style={{
                ...styles.button,
                backgroundColor: showBatteryPoints ? "#3b82f6" : "#e2e8f0",
                color: showBatteryPoints ? "white" : "#64748b",
              }}
              onClick={() => setShowBatteryPoints(!showBatteryPoints)}
            >
              {showBatteryPoints ? "Hide Battery Points" : "Show Battery Points"}
            </button>
            <button 
              style={{
                ...styles.button,
                backgroundColor: showAltimeterPoints ? "#3b82f6" : "#e2e8f0",
                color: showAltimeterPoints ? "white" : "#64748b",
              }}
              onClick={() => setShowAltimeterPoints(!showAltimeterPoints)}
            >
              {showAltimeterPoints ? "Hide Altimeter Points" : "Show Altimeter Points"}
            </button>
            <button 
              style={{
                ...styles.button,
                backgroundColor: showBasePoints ? "#3b82f6" : "#e2e8f0",
                color: showBasePoints ? "white" : "#64748b",
              }}
              onClick={() => setShowBasePoints(!showBasePoints)}
            >
              {showBasePoints ? "Hide Base Points" : "Show Base Points"}
            </button>
            <button 
              style={{
                ...styles.button,
                backgroundColor: showUsblTrack ? "#3b82f6" : "#e2e8f0",
                color: showUsblTrack ? "white" : "#64748b",
              }}
              onClick={() => setShowUsblTrack(!showUsblTrack)}
            >
              {showUsblTrack ? "Hide USBL Track" : "Show USBL Track"}
            </button>
          </div>

          {/* SVG plot */}
          <svg
            width="100%"
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={styles.svgContainer}
          >
            {/* USBL track line and points */}
            {showUsblTrack && (
              <>
                {/* USBL connecting line */}
                <path
                  d={usblData.map((point, i) => {
                    const { x, y } = mapToSVG(
                      point.latitude,
                      point.longitude,
                      svgWidth,
                      svgHeight
                    );
                    return `${i === 0 ? "M" : "L"} ${x},${y}`;
                  }).join(" ")}
                  fill="none"
                  stroke="black"
                  strokeWidth="1"
                  opacity="0.5
                />
                {/* USBL points */}
                {usblData.map((point, index) => {
                  const { x, y } = mapToSVG(
                    point.latitude,
                    point.longitude,
                    svgWidth,
                    svgHeight
                  );
                  return (
                    <circle
                      key={`usbl-point-${index}`}
                      cx={x}
                      cy={y}
                      r="2"
                      fill={getColorForDepth(point.depth)}
                      stroke="none"
                      opacity="0.8"
                    />
                  );
                })}
              </>
            )}

            {/* Base black lines for actual and planned paths */}
            <path
              d={actualPoints
                .map((point, i) => `${i === 0 ? "M" : "L"} ${point.x},${point.y}`)
                .join(" ")}
              fill="none"
              stroke="black"
              strokeWidth="2"
              opacity="0.7"
            />
            <path
              d={plannedPoints
                .map((point, i) => `${i === 0 ? "M" : "L"} ${point.x},${point.y}`)
                .join(" ")}
              fill="none"
              stroke="black"
              strokeWidth="2"
              strokeDasharray="5,5"
              opacity="0.7"
            />

            {/* Draw planned waypoint markers */}
            {plannedPoints.map((point, index) => (
              <React.Fragment key={`planned-waypoint-${index}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  fill="purple"
                  fillOpacity="0.6"
                  stroke={hoveredPoint === index && hoveredType === "planned" ? "#000" : "none"}
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

            {/* Base black points */}
            {showBasePoints && actualPoints.map((point, index) => (
              <React.Fragment key={`base-point-${index}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="3"
                  fill="black"
                  fillOpacity="0.7"
                  stroke={hoveredPoint === index && hoveredType === "base" ? "#000" : "none"}
                  strokeWidth="1"
                  onMouseEnter={() => {
                    setHoveredPoint(index);
                    setHoveredType("base");
                  }}
                  onMouseLeave={() => {
                    setHoveredPoint(null);
                    setHoveredType(null);
                  }}
                />
              </React.Fragment>
            ))}

            {/* Draw data points based on toggle state */}
            {showDepthPoints && actualPoints.map((point, index) => (
              <circle
                key={`depth-point-${index}`}
                cx={point.x}
                cy={point.y}
                r="3"
                fill={getColorForDepth(point.depth)}
                stroke={hoveredPoint === index && hoveredType === "depth" ? "#000" : "none"}
                strokeWidth="1"
                onMouseEnter={() => {
                  setHoveredPoint(index);
                  setHoveredType("depth");
                }}
                onMouseLeave={() => {
                  setHoveredPoint(null);
                  setHoveredType(null);
                }}
              />
            ))}

            {showVelocityPoints && actualPoints.map((point, index) => (
              <circle
                key={`velocity-point-${index}`}
                cx={point.x}
                cy={point.y}
                r="3"
                fill={getColorForVelocity(
                  point.original.velX,
                  point.original.velY,
                  point.original.velZ
                )}
                stroke={hoveredPoint === index && hoveredType === "velocity" ? "#000" : "none"}
                strokeWidth="1"
                onMouseEnter={() => {
                  setHoveredPoint(index);
                  setHoveredType("velocity");
                }}
                onMouseLeave={() => {
                  setHoveredPoint(null);
                  setHoveredType(null);
                }}
              />
            ))}

            {showModePoints && actualPoints.map((point, index) => (
              <circle
                key={`mode-point-${index}`}
                cx={point.x}
                cy={point.y}
                r="3"
                fill={modeColors[point.original.navMode] || "#999"}
                stroke={hoveredPoint === index && hoveredType === "mode" ? "#000" : "none"}
                strokeWidth="1"
                onMouseEnter={() => {
                  setHoveredPoint(index);
                  setHoveredType("mode");
                }}
                onMouseLeave={() => {
                  setHoveredPoint(null);
                  setHoveredType(null);
                }}
              />
            ))}

            {showBatteryPoints && actualPoints.map((point, index) => (
              <circle
                key={`battery-point-${index}`}
                cx={point.x}
                cy={point.y}
                r="3"
                fill={getColorForBattery(point.original.battery_volts)}
                stroke={hoveredPoint === index && hoveredType === "battery" ? "#000" : "none"}
                strokeWidth="1"
                onMouseEnter={() => {
                  setHoveredPoint(index);
                  setHoveredType("battery");
                }}
                onMouseLeave={() => {
                  setHoveredPoint(null);
                  setHoveredType(null);
                }}
              />
            ))}

            {showAltimeterPoints && actualPoints.map((point, index) => (
              <circle
                key={`altimeter-point-${index}`}
                cx={point.x}
                cy={point.y}
                r="3"
                fill={getColorForAltimeter(point.original.acousticAltimeter)}
                stroke={hoveredPoint === index && hoveredType === "altimeter" ? "#000" : "none"}
                strokeWidth="1"
                onMouseEnter={() => {
                  setHoveredPoint(index);
                  setHoveredType("altimeter");
                }}
                onMouseLeave={() => {
                  setHoveredPoint(null);
                  setHoveredType(null);
                }}
              />
            ))}

            {/* Shared tooltip for all point types */}
            {hoveredPoint !== null && ["base", "depth", "velocity", "mode", "battery", "altimeter"].includes(hoveredType) && (
              <g>
                <rect
                  x={actualPoints[hoveredPoint].x + (actualPoints[hoveredPoint].x > svgWidth/2 ? -290 : 10)}
                  y={actualPoints[hoveredPoint].y - 140}
                  width="280"
                  height="280"
                  fill="#1e293b"
                  fillOpacity="0.95"
                  rx="4"
                />
                {/* Title with Date and Time */}
                <text x={actualPoints[hoveredPoint].x + (actualPoints[hoveredPoint].x > svgWidth/2 ? -280 : 20)} y={actualPoints[hoveredPoint].y - 120} fill="white" fontSize="12" fontWeight="bold">
                  {formatDateOnly(actualPoints[hoveredPoint].original.timestamp_sys)}
                </text>
                <text x={actualPoints[hoveredPoint].x + (actualPoints[hoveredPoint].x > svgWidth/2 ? -280 : 20)} y={actualPoints[hoveredPoint].y - 105} fill="#8db0e8" fontSize="11">
                  Time: {formatTimeOnly(actualPoints[hoveredPoint].original.timestamp_sys)}
                </text>

                {/* Left Column */}
                <g transform={`translate(${actualPoints[hoveredPoint].x + (actualPoints[hoveredPoint].x > svgWidth/2 ? -280 : 20)}, ${actualPoints[hoveredPoint].y - 85})`}>
                  {/* Position Section */}
                  <text y="0" fill="white" fontSize="11" fontWeight="bold">Position</text>
                  <text y="15" fill="#8db0e8" fontSize="11">Lat: {actualPoints[hoveredPoint].original.latitude.toFixed(6)}°</text>
                  <text y="30" fill="#8db0e8" fontSize="11">Long: {actualPoints[hoveredPoint].original.longitude.toFixed(6)}°</text>
                  <text y="45" fill="#8db0e8" fontSize="11">Depth: {actualPoints[hoveredPoint].original.depth.toFixed(2)}m</text>

                  {/* Vehicle State Section */}
                  <text y="70" fill="white" fontSize="11" fontWeight="bold">Vehicle State</text>
                  <text y="85" fill="#8db0e8" fontSize="11">Nav Mode: {actualPoints[hoveredPoint].original.navMode}</text>
                  <text y="100" fill="#8db0e8" fontSize="11">Battery: {actualPoints[hoveredPoint].original.battery_volts.toFixed(2)}V</text>
                  <text y="115" fill="#8db0e8" fontSize="11">Error: {actualPoints[hoveredPoint].original.errorState}</text>
                </g>

                {/* Right Column */}
                <g transform={`translate(${actualPoints[hoveredPoint].x + (actualPoints[hoveredPoint].x > svgWidth/2 ? -140 : 160)}, ${actualPoints[hoveredPoint].y - 85})`}>
                  {/* Motion Section */}
                  <text y="0" fill="white" fontSize="11" fontWeight="bold">Motion</text>
                  <text y="15" fill="#8db0e8" fontSize="11">Vel X: {actualPoints[hoveredPoint].original.velX.toFixed(2)}m/s</text>
                  <text y="30" fill="#8db0e8" fontSize="11">Vel Y: {actualPoints[hoveredPoint].original.velY.toFixed(2)}m/s</text>
                  <text y="45" fill="#8db0e8" fontSize="11">Vel Z: {actualPoints[hoveredPoint].original.velZ.toFixed(2)}m/s</text>

                  {/* Attitude Section */}
                  <text y="70" fill="white" fontSize="11" fontWeight="bold">Attitude</text>
                  <text y="85" fill="#8db0e8" fontSize="11">Roll: {actualPoints[hoveredPoint].original.roll.toFixed(2)}°</text>
                  <text y="100" fill="#8db0e8" fontSize="11">Pitch: {actualPoints[hoveredPoint].original.pitch.toFixed(2)}°</text>
                  <text y="115" fill="#8db0e8" fontSize="11">Yaw: {actualPoints[hoveredPoint].original.yaw.toFixed(2)}°</text>

                  {/* Distance Section */}
                  <text y="140" fill="white" fontSize="11" fontWeight="bold">Distance</text>
                  <text y="155" fill="#8db0e8" fontSize="11">Floor: {actualPoints[hoveredPoint].original.distance_to_ocean_floor.toFixed(2)}m</text>
                  <text y="170" fill="#8db0e8" fontSize="11">Alt: {actualPoints[hoveredPoint].original.acousticAltimeter.toFixed(2)}m</text>
                </g>
              </g>
            )}

            {/* Draw attitude indicators */}
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

            {/* Draw incident markers */}
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
                {hoveredIncident === index && (
                  <g>
                    <rect
                      x={marker.x + 10}
                      y={marker.y - 60}
                      width="240"
                      height="120"
                      fill="#1e293b"
                      fillOpacity="0.95"
                      rx="4"
                    />
                    <text x={marker.x + 20} y={marker.y - 40} fill="white" fontSize="12" fontWeight="bold">
                      Incident Cluster
                    </text>
                    <text x={marker.x + 20} y={marker.y - 25} fill="#8db0e8" fontSize="11">
                      Events: {marker.incident.count}
                    </text>
                    <text x={marker.x + 20} y={marker.y - 10} fill="#8db0e8" fontSize="11">
                      Primary: {marker.incident.primaryReason}
                    </text>
                    {marker.incident.allReasons.slice(1).map((reason, i) => (
                      <text key={i} x={marker.x + 20} y={marker.y + 5 + i * 15} fill="#8db0e8" fontSize="11">
                        Also: {reason}
                      </text>
                    ))}
                  </g>
                )}
              </g>
            ))}
          </svg>

          {/* Combined Legends Section */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            padding: "24px",
            backgroundColor: "#f8fafc",
            borderRadius: "8px",
            marginTop: "24px",
          }}>
            {/* Path Types */}
            <div style={{
              display: "flex",
              gap: "32px",
              justifyContent: "center",
              alignItems: "center",
              borderBottom: "1px solid #e2e8f0",
              paddingBottom: "16px",
            }}>
              <div style={styles.legendItem}>
                <div style={{ ...styles.legendDot, backgroundColor: "black" }}></div>
                <span>Actual Path</span>
              </div>
              <div style={styles.legendItem}>
                <div style={{ ...styles.legendLine, borderTop: "2px dashed black" }}></div>
                <span>Planned Route</span>
              </div>
              {showIncidents && (
                <div style={styles.legendItem}>
                  <div style={{ ...styles.legendDot, backgroundColor: "#ef4444" }}></div>
                  <span>Incidents ({incidents.length})</span>
                </div>
              )}
            </div>

            {/* Data Types */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "32px",
              justifyContent: "center",
            }}>
              {/* Column 1: Depth and Velocity */}
              <div>
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontWeight: "600", marginBottom: "8px" }}>Depth (m)</div>
                  <div style={{ 
                    width: "100%", 
                    height: "12px", 
                    background: "linear-gradient(to right, #dbeafe, #1e3a8a)",
                    borderRadius: "4px",
                    marginBottom: "4px"
                  }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                    <span>{depthRange.min.toFixed(1)}</span>
                    <span>{depthRange.max.toFixed(1)}</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontWeight: "600", marginBottom: "8px" }}>Velocity (m/s)</div>
                  <div style={{ 
                    width: "100%", 
                    height: "12px", 
                    background: "linear-gradient(to right, hsl(200, 100%, 50%), hsl(360, 100%, 50%))",
                    borderRadius: "4px",
                    marginBottom: "4px"
                  }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                    <span>{velocityRange.min.toFixed(1)}</span>
                    <span>{velocityRange.max.toFixed(1)}</span>
                  </div>
                </div>
              </div>

              {/* Column 2: Battery and Altimeter */}
              <div>
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontWeight: "600", marginBottom: "8px" }}>Battery (V)</div>
                  <div style={{ 
                    width: "100%", 
                    height: "12px", 
                    background: "linear-gradient(to right, hsl(0, 100%, 50%), hsl(120, 100%, 50%))",
                    borderRadius: "4px",
                    marginBottom: "4px"
                  }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                    <span>{batteryRange.min.toFixed(1)}</span>
                    <span>{batteryRange.max.toFixed(1)}</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontWeight: "600", marginBottom: "8px" }}>Altimeter (m)</div>
                  <div style={{ 
                    width: "100%", 
                    height: "12px", 
                    background: "linear-gradient(to right, hsl(280, 0%, 50%), hsl(280, 100%, 50%))",
                    borderRadius: "4px",
                    marginBottom: "4px"
                  }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                    <span>{altimeterRange.min.toFixed(1)}</span>
                    <span>{altimeterRange.max.toFixed(1)}</span>
                  </div>
                </div>
              </div>

              {/* Column 3: Nav Modes and Attitude */}
              <div>
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontWeight: "600", marginBottom: "8px" }}>Nav Modes</div>
                  {Object.entries(modeColors).map(([mode, color]) => (
                    <div key={mode} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <div style={{ 
                        width: "12px", 
                        height: "12px", 
                        borderRadius: "50%", 
                        backgroundColor: color 
                      }} />
                      <span style={{ fontSize: "0.875rem" }}>Mode {mode}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <div style={{ fontWeight: "600", marginBottom: "8px" }}>Attitude</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <div style={{ width: "20px", height: "2px", backgroundColor: "orange" }} />
                    <span style={{ fontSize: "0.875rem" }}>Roll</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "20px", height: "2px", backgroundColor: "green" }} />
                    <span style={{ fontSize: "0.875rem" }}>Pitch</span>
                  </div>
                </div>
              </div>
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
            Hover over points to see detailed information. The actual path is shown in black,
            while the planned route is shown as a black dotted line with numbered waypoints.
            Toggle different data points using the buttons above to visualize various mission metrics.
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionPathWithIncidents;