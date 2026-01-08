const admin = require("firebase-admin");
const db = admin.firestore();
const {getUsersRef, getSettingsRef} = require("../utils/dbHelpers");

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized: No token provided."});
  }

  const {payload, organizationId} = req.body;
  if (!payload || !organizationId) {
    return res.status(400).json({success: false, message: "Missing payload or organizationId."});
  }

  const idToken = req.headers.authorization.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Use helper to look up user in the correct organization
    const userDoc = await getUsersRef(organizationId).doc(uid).get();

    if (!userDoc.exists || userDoc.data().role !== "Master Admin") {
      return res.status(403).json({success: false, message: "Permission denied. Only Master Admins can modify settings."});
    }
  } catch (error) {
    console.error("Authentication error in updateAdminSettings:", error);
    return res.status(403).json({success: false, message: "Authentication failed."});
  }

  try {
    const batch = db.batch();
    // Use helper to get a reference to the correct settings subcollection
    const settingsRef = getSettingsRef(organizationId);

    if (payload.permissions) {
      const permissionsRef = settingsRef.doc("permissions");
      batch.set(permissionsRef, payload.permissions);
    }

    if (payload.dropdowns) {
      const dropdownsRef = settingsRef.doc("dropdowns");
      batch.set(dropdownsRef, payload.dropdowns);
    }

    await batch.commit();
    res.status(200).json({success: true, message: "Admin settings saved successfully."});
  } catch (error) {
    console.error("Error updating admin settings:", error);
    res.status(500).json({success: false, message: `Server Error: ${error.message}`});
  }
};
