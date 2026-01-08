// In /functions/api/exportToGoogleSheets.js
const admin = require("firebase-admin");
const {getUsersRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized"});
  }

  const {data, organizationId} = req.body;
  if (!data || !organizationId) {
    return res.status(400).json({success: false, message: "No data or organizationId provided to export."});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Check user's role within their organization
    const userDoc = await getUsersRef(organizationId).doc(uid).get();
    if (!userDoc.exists) {
      throw new Error("User not found in this organization.");
    }
    const userRole = userDoc.data().role;
    if (userRole !== "Master Admin" && userRole !== "Admin") {
      throw new Error("Permission denied. Admin role required for export.");
    }

    console.log(`User ${uid} from org ${organizationId} initiated an export of ${data.length} rows to Google Sheets.`);

    // Placeholder for actual Google Sheets API logic
    res.status(200).json({
      success: true,
      message: "Export successful!",
      sheetUrl: "https://docs.google.com/spreadsheets/d/example",
    });
  } catch (error) {
    console.error("Export to Google Sheets failed:", error);
    return res.status(error.message.startsWith("Permission denied") ? 403 : 500).json({success: false, message: error.message});
  }
};
