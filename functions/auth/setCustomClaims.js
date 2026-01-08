const admin = require("firebase-admin");
// CORRECTED: Import FieldValue alongside getFirestore
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

exports.handler = async (user) => {
  const {uid, email, displayName} = user;

  const DEFAULT_ORGANIZATION_ID = "8uIhrnu3EppS0SlNe0ro";

  try {
    const organizationId = DEFAULT_ORGANIZATION_ID;
    const role = "Standard";

    const userOrgMapRef = db.collection("user_org_map").doc(uid);
    await userOrgMapRef.set({organizationId});
    console.log(`Created organization mapping for user ${uid}.`);

    const userProfileRef = db.collection("organizations").doc(organizationId).collection("users").doc(uid);
    await userProfileRef.set({
      email: email || "",
      displayName: displayName || "New User",
      role: role,
      status: "pending",
      // CORRECTED: Use the imported FieldValue
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log(`Created user profile for ${uid} in organization ${organizationId}.`);

    await admin.auth().setCustomUserClaims(uid, {
      organizationId,
      role,
    });
    console.log(`Custom claims set for user ${uid}: org='${organizationId}', role='${role}'`);
  } catch (error) {
    console.error(`Error setting up new user ${uid}:`, error);
  }
};
