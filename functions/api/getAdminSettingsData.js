// in functions/api/getAdminSettingsData.js

const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
// NOTE: We will still use the specific helpers for subcollections
const {getUsersRef, getStaffRef, getStudentsRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized: No token provided."});
  }

  const {organizationId} = req.body;
  if (!organizationId) {
    return res.status(400).json({success: false, message: "Organization ID is required."});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // --- CRITICAL SECURITY CHECK ---
    const userRef = getUsersRef(organizationId).doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists || !["Admin", "Master Admin"].includes(userDoc.data().role)) {
      return res.status(403).json({success: false, message: "Permission Denied. You do not have rights to access admin settings."});
    }
    // --- END OF SECURITY CHECK ---

    // If the check passes, proceed to fetch the admin data
    const usersRef = getUsersRef(organizationId);
    const usersSnapshot = await usersRef.get();
    const pendingUsers = [];
    const userRoles = [];
    usersSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.status === "pending") {
        pendingUsers.push({id: doc.id, ...data});
      } else {
        userRoles.push({id: doc.id, ...data});
      }
    });

    const staffSnapshot = await getStaffRef(organizationId).get();
    const staffList = staffSnapshot.docs.map((doc) => doc.data());

    // FIX: Check if students are enabled before fetching
    let studentList = [];
    // Assuming student feature might be disabled in the future, let's check
    // We will just return an empty list if there's an error, to be safe.
    try {
      const studentsSnapshot = await getStudentsRef(organizationId).get();
      studentList = studentsSnapshot.docs.map((doc) => doc.data());
    } catch (e) {
      console.warn("Could not fetch student list, continuing without it.", e.message);
    }

    // FIX: Directly reference the settings subcollection
    const settingsRef = db.collection("organizations").doc(organizationId).collection("settings");
    const permissionsDoc = await settingsRef.doc("permissions").get();
    const dropdownsDoc = await settingsRef.doc("dropdowns").get();

    res.status(200).json({
      success: true,
      pendingUsers,
      userRoles,
      staffList,
      studentList,
      permissions: permissionsDoc.exists ? permissionsDoc.data() : {},
      dropdowns: dropdownsDoc.exists ? dropdownsDoc.data() : {},
    });
  } catch (error) {
    console.error("Error fetching admin settings:", error);
    res.status(500).json({success: false, message: `An internal server error occurred: ${error.message}`});
  }
};
