// in functions/api/getSessionInfo.js

const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {getOrganizationsRef, getUsersRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized"});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const {uid, email} = decodedToken;
    const domain = email.split("@")[1];

    // Find the organization document based on the user's email domain
    const orgQuery = await getOrganizationsRef().where("domain", "==", domain).limit(1).get();

    let organizationId;
    let userDocRef;
    let userDoc;

    if (orgQuery.empty) {
      // --- Path for the VERY FIRST user of a NEW organization ---
      const newOrgRef = getOrganizationsRef().doc();
      organizationId = newOrgRef.id;
      userDocRef = getUsersRef(organizationId).doc(uid);

      // Create the organization and the first user (as Master Admin) in a batch
      const batch = db.batch();
      batch.set(newOrgRef, {name: domain, domain: domain, createdBy: email});
      batch.set(userDocRef, {
        email: email,
        role: "Master Admin",
        status: "approved", // The first user is automatically approved
        organizationId: organizationId,
      });
      await batch.commit();

      // Set custom claims for the new Master Admin
      await admin.auth().setCustomUserClaims(uid, {organizationId, role: "Master Admin"});
      userDoc = await userDocRef.get();
    } else {
      // --- Path for all subsequent users of an EXISTING organization ---
      const orgDoc = orgQuery.docs[0];
      organizationId = orgDoc.id;
      userDocRef = getUsersRef(organizationId).doc(uid);
      userDoc = await userDocRef.get();

      if (!userDoc.exists) {
        // If the user does not have a record, create one as 'pending'
        await userDocRef.set({
          email: email,
          status: "pending", // New users are pending by default
          organizationId: organizationId,
          // No role is assigned until approved
        });
        userDoc = await userDocRef.get(); // Re-fetch the newly created doc
      }
    }

    const userData = userDoc.data();
    res.status(200).json({success: true, ...userData, uid});
  } catch (error) {
    console.error("Get Session Info Error:", error);
    res.status(500).json({success: false, message: `An error occurred: ${error.message}`});
  }
};
