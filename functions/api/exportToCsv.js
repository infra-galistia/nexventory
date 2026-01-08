// In /functions/api/exportToCsv.js
const admin = require("firebase-admin");
const {getUsersRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Updated permission check to be organization-aware
const checkPermissions = async (idToken, organizationId) => {
  const decodedToken = await admin.auth().verifyIdToken(idToken);
  const uid = decodedToken.uid;

  const userDoc = await getUsersRef(organizationId).doc(uid).get();
  if (!userDoc.exists) {
    throw new Error("User not found in this organization.");
  }

  const userRole = userDoc.data().role;
  if (userRole !== "Master Admin" && userRole !== "Admin") {
    throw new Error("Permission denied. Admin role required for export.");
  }
};

const convertToCsv = (data) => {
  if (!data || data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const csvRows = data.map((row) =>
    headers.map((fieldName) => {
      let value = row[fieldName] === null || row[fieldName] === undefined ? "" : row[fieldName];
      if (typeof value === "object") value = JSON.stringify(value);
      const stringValue = String(value).replace(/"/g, "\"\"");
      return stringValue.includes(",") ? `"${stringValue}"` : stringValue;
    }).join(","),
  );
  csvRows.unshift(headers.join(","));
  return csvRows.join("\r\n");
};

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).send("Unauthorized");
  }

  const {data, organizationId} = req.body;
  if (!data || !organizationId) {
    return res.status(400).send("No data or organizationId provided to export.");
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    await checkPermissions(idToken, organizationId);

    const csv = convertToCsv(data);
    const fileName = `nexventory_export_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.status(200).send(csv);
  } catch (error) {
    console.error("Failed to generate CSV:", error);
    res.status(error.message.startsWith("Permission denied") ? 403 : 500).send(error.message);
  }
};
