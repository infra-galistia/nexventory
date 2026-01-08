const admin = require("firebase-admin");
const db = admin.firestore();
const {getUsersRef} = require("../utils/dbHelpers");

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized"});
  }

  const {payload, organizationId} = req.body;
  if (!payload || !organizationId) {
    return res.status(400).json({success: false, message: "Missing payload or organizationId."});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const adminUid = decodedToken.uid;

    // Check permission of the user MAKING the request
    const adminUserDoc = await getUsersRef(organizationId).doc(adminUid).get();
    if (!adminUserDoc.exists || adminUserDoc.data().role !== "Master Admin") {
      return res.status(403).json({success: false, message: "Permission denied. Only Master Admins can modify permissions."});
    }

    // Get details of the user being CHANGED
    const {uid, email, role, permissions} = payload;
    if (!uid || !role || !permissions) {
      return res.status(400).json({success: false, message: "Missing required fields: uid, role, and permissions."});
    }

    // Use the uid from the payload to get the correct user reference
    const targetUserRef = getUsersRef(organizationId).doc(uid);

    await targetUserRef.update({
      role: role,
      permissionOverrides: permissions,
    });

    // Also update the custom claims on the user's token for immediate effect on next login
    await admin.auth().setCustomUserClaims(uid, {organizationId: organizationId, role: role});

    res.status(200).json({success: true, message: `Permissions for ${email} updated successfully.`});
  } catch (error) {
    console.error("Error updating user permissions:", error);
    res.status(500).json({success: false, message: `Server Error: ${error.message}`});
  }
};
