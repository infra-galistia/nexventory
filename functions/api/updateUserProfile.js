const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");

// We no longer need dbHelpers for this function
// const { getUsersRef } = require('../utils/dbHelpers');

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({message: "Unauthorized"});
  }

  const {displayName, organizationId} = req.body;
  if (!displayName || !organizationId) {
    return res.status(400).json({message: "Display name and organizationId are required."});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // 1. Update the name in Firebase Authentication (this is global)
    await admin.auth().updateUser(uid, {displayName: displayName});

    // 2. Update the name in the organization-specific 'users' collection in Firestore
    // CORRECTED: Use the direct, explicit path to the user's document
    const userDocRef = db.collection("organizations").doc(organizationId).collection("users").doc(uid);

    // CORRECTED: Use .set with merge:true for a more robust update.
    // This will update the field if the doc exists, or create the doc if it's missing.
    await userDocRef.set({
      displayName: displayName,
    }, {merge: true});

    return res.status(200).json({success: true, message: "Your name has been updated successfully."});
  } catch (error) {
    console.error("Error updating user profile:", error);
    return res.status(500).json({message: "An error occurred while updating your profile."});
  }
};
