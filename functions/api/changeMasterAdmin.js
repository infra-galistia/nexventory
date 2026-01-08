// in functions/api/changeMasterAdmin.js

const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {getUsersRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized"});
  }

  const {newMasterAdminEmail, organizationId} = req.body;
  if (!newMasterAdminEmail || !organizationId) {
    return res.status(400).json({success: false, message: "New Master Admin email and Organization ID are required."});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const currentMasterAdminUid = decodedToken.uid;

    // Security Check 1: Verify the person making the request IS the current Master Admin
    const currentAdminUserDoc = await getUsersRef(organizationId).doc(currentMasterAdminUid).get();
    if (!currentAdminUserDoc.exists || currentAdminUserDoc.data().role !== "Master Admin") {
      return res.status(403).json({success: false, message: "Permission denied. Only the current Master Admin can perform this action."});
    }

    // Security Check 2: Find the user who will become the new Master Admin
    const newAdminAuthRecord = await admin.auth().getUserByEmail(newMasterAdminEmail);
    const newMasterAdminUid = newAdminAuthRecord.uid;

    if (currentMasterAdminUid === newMasterAdminUid) {
      return res.status(400).json({success: false, message: "You cannot reassign the Master Admin role to yourself."});
    }

    // Use a transaction to ensure the operation is atomic (it either all succeeds or all fails)
    await db.runTransaction(async (transaction) => {
      const currentAdminRef = getUsersRef(organizationId).doc(currentMasterAdminUid);
      const newAdminRef = getUsersRef(organizationId).doc(newMasterAdminUid);

      const newAdminDoc = await transaction.get(newAdminRef);
      if (!newAdminDoc.exists) {
        throw new Error(`User with email ${newMasterAdminEmail} does not have a user record in this organization.`);
      }

      // Demote the current Master Admin to a regular Admin
      transaction.update(currentAdminRef, {role: "Admin"});
      // Promote the new user to Master Admin
      transaction.update(newAdminRef, {role: "Master Admin"});
    });

    // Update custom auth claims for both users so their new roles take effect immediately
    await admin.auth().setCustomUserClaims(currentMasterAdminUid, {organizationId, role: "Admin"});
    await admin.auth().setCustomUserClaims(newMasterAdminUid, {organizationId, role: "Master Admin"});

    res.status(200).send({success: true, message: `Master Admin role successfully transferred to ${newMasterAdminEmail}. You have been assigned the Admin role.`});
  } catch (error) {
    console.error("Master Admin transfer failed:", error);
    res.status(500).send({success: false, message: `An error occurred: ${error.message}`});
  }
};
