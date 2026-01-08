const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  const {orgName, fullName, email, password, department} = req.body;

  if (!orgName || !fullName || !email || !password || !department) {
    return res.status(400).json({success: false, message: "All fields are required."});
  }

  try {
    // Step 1: Create the new user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: fullName,
    });
    const uid = userRecord.uid;

    // Step 2: Prepare the batch write for Firestore to ensure atomicity
    const batch = db.batch();

    // Step 2a: Create the new organization document
    const orgRef = db.collection("organizations").doc(); // Auto-generate a unique ID for the org
    const organizationId = orgRef.id;
    batch.set(orgRef, {
      orgName: orgName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ownerUid: uid,
    });

    // Step 2b: Create the Master Admin user document within the new organization
    const userRef = orgRef.collection("users").doc(uid);
    batch.set(userRef, {
      email: email,
      displayName: fullName,
      uid: uid,
      role: "Master Admin",
      status: "approved",
      department: department,
      organizationId: organizationId, // Link the user to the organization
    });

    // Step 2c: Create the critical user-to-organization mapping document
    const userOrgMapRef = db.collection("user_org_map").doc(uid);
    batch.set(userOrgMapRef, {
      organizationId: organizationId,
    });

    // Step 2d: (Optional but good practice) Create initial settings documents
    const settingsRef = orgRef.collection("settings");
    batch.set(settingsRef.doc("dropdowns"), {Departments: [department], Purpose: ["General Use"], DepartmentMap: {}});
    batch.set(settingsRef.doc("permissions"), {
      "Standard": ["canLogDamaged"],
      "Sub-admin": ["canLogDamaged", "canTransfer"],
      "Admin": ["canManageInventory", "canBuildKits", "canTransfer", "canLogDamaged", "canLogLost", "canExportData", "canEditItems"],
    });

    // Step 3: Commit all writes at once
    await batch.commit();

    // Step 4: Set Custom Claims (will be used by security rules)
    await admin.auth().setCustomUserClaims(uid, {organizationId: organizationId, role: "Master Admin"});

    res.status(201).json({success: true, message: "Organization created successfully. You can now log in."});
  } catch (error) {
    console.error("Error creating new organization:", error);
    // Provide a more user-friendly error message
    let message = "An unexpected error occurred.";
    if (error.code === "auth/email-already-exists") {
      message = "This email address is already in use by another account.";
    } else if (error.code === "auth/invalid-password") {
      message = "Password must be at least 6 characters long.";
    }
    res.status(500).json({success: false, message: message});
  }
};
