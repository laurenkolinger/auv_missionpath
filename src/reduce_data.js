const fs = require("fs");
const Papa = require("papaparse");

// Read the original CSV file
fs.readFile("mission_travel_path.csv", "utf8", (err, data) => {
  if (err) {
    console.error("Error reading file:", err);
    return;
  }

  // Parse the CSV
  const result = Papa.parse(data, {
    header: true,
    skipEmptyLines: true,
  });

  // Keep only every 10th row (and the header)
  const reducedData = result.data.filter((_, index) => index % 10 === 0);

  // Convert back to CSV
  const output = Papa.unparse(reducedData);

  // Write to a new file
  fs.writeFile("mission_travel_path_reduced.csv", output, (err) => {
    if (err) {
      console.error("Error writing file:", err);
      return;
    }
    console.log(
      `Successfully reduced data from ${result.data.length} to ${reducedData.length} rows`
    );
  });
});
