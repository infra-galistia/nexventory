const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {getUsersRef} = require("../utils/dbHelpers"); // Assuming dbHelpers is in a utils folder

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  // --- FIX #1: Get organizationId from the top level of the request body ---
  const {action, payload, organizationId} = req.body;

  // --- FIX #2: Make validation smarter based on the action ---
  if (!action || !payload || !organizationId) {
    return res.status(400).json({success: false, message: "Missing required data: action, payload, and organizationId are required."});
  }

  // Handle the 'addUser' action separately since it won't have a UID yet.
  if (action === "addUser") {
    try {
      if (!payload.role || !payload.email) {
        return res.status(400).json({success: false, message: "Role and email are required for new users."});
      }
      const email = payload.email.toLowerCase();

      // --- FIX #3: Find the user's UID from their email ---
      const userRecord = await admin.auth().getUserByEmail(email);
      const uid = userRecord.uid;

      const userRef = getUsersRef(organizationId).doc(uid);

      await userRef.set({
        role: payload.role,
        email: email,
        status: "approved",
        organizationId: organizationId,
      }, {merge: true});

      // Set custom claims so their role is immediately active
      await admin.auth().setCustomUserClaims(uid, {organizationId, role: payload.role});

      return res.status(200).json({success: true, message: `User ${email} has been saved.`});
    } catch (error) {
      console.error("Error in 'addUser' action:", error);
      if (error.code === "auth/user-not-found") {
        return res.status(404).json({success: false, message: `User with email ${payload.email} not found in Firebase Authentication. Please ensure they have signed in at least once.`});
      }
      return res.status(500).json({success: false, message: `Server Error: ${error.message}`});
    }
  }

  // For all other actions, a UID in the payload is required.
  if (!payload.uid) {
    return res.status(400).json({success: false, message: "A user UID is required for this action."});
  }

  const {uid, ...restPayload} = payload;
  const userRef = getUsersRef(organizationId).doc(uid);

  try {
    if (action === "deleteUser" || action === "denyUser") {
      const userDoc = await userRef.get();
      if (userDoc.exists && userDoc.data().role === "Master Admin") {
        return res.status(403).json({success: false, message: "The Master Admin role cannot be modified."});
      }
      await userRef.delete();
      // Optional: Also delete the user from Firebase Auth if desired
      // await admin.auth().deleteUser(uid);
      const message = action === "denyUser" ? `Request for user ${restPayload.email || uid} has been denied.` : `User ${restPayload.email || uid} has been removed.`;
      return res.status(200).json({success: true, message: message});
    } else if (action === "approveUser") {
      if (!restPayload.role || !restPayload.department) {
        return res.status(400).json({success: false, message: "Role and Department are required."});
      }
      await userRef.update({
        status: "approved",
        role: restPayload.role,
        department: restPayload.department,
      });
      await admin.auth().setCustomUserClaims(uid, {organizationId, role: restPayload.role});
      return res.status(200).json({success: true, message: `User with UID ${uid} has been approved.`});
    } else if (action === "updateUserOverrides") {
      if (!restPayload.overrides) {
        return res.status(400).json({success: false, message: "Overrides data is missing."});
      }
      await userRef.update({permissionOverrides: restPayload.overrides});
      return res.status(200).json({success: true, message: `Permission overrides for user ${uid} have been saved.`});
    } else {
      return res.status(400).json({success: false, message: "Invalid action specified."});
    }
  } catch (error) {
    console.error(`Error during '${action}' for user ${uid}:`, error);
    return res.status(500).json({success: false, message: `Server Error: ${error.message}`});
  }
};
