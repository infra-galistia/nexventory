const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {getStaffRef, getStudentsRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized"});
  }

  const {action, payload, userType, organizationId} = req.body;
  if (!action || !payload || !userType || !organizationId || (userType !== "staff" && userType !== "student")) {
    return res.status(400).json({success: false, message: "Missing or invalid required data."});
  }

  // Verify token to ensure user is authenticated for this action
  try {
    await admin.auth().verifyIdToken(req.headers.authorization.split("Bearer ")[1]);
  } catch (e) {
    return res.status(403).json({success: false, message: "Invalid token."});
  }

  const collectionRef = userType === "staff" ? getStaffRef(organizationId) : getStudentsRef(organizationId);

  try {
    if (action === "addUser") {
      const docId = userType === "staff" ? payload.email : payload.id;
      if (!docId) return res.status(400).json({success: false, message: "Email for staff or ID for student is required."});

      await collectionRef.doc(docId).set(payload);
      return res.status(200).json({success: true, message: `${userType.charAt(0).toUpperCase() + userType.slice(1)} added successfully.`});
    } else if (action === "deleteUser") {
      const docId = userType === "staff" ? payload.email : payload.id;
      if (!docId) return res.status(400).json({success: false, message: "Identifier (email or ID) is required to delete."});

      await collectionRef.doc(docId).delete();
      return res.status(200).json({success: true, message: `${userType.charAt(0).toUpperCase() + userType.slice(1)} removed successfully.`});
    } else if (action === "bulkImport") {
      const users = payload.users;
      if (!Array.isArray(users) || users.length === 0) {
        return res.status(400).json({success: false, message: "No user data provided for import."});
      }
      const batch = db.batch();
      users.forEach((user) => {
        const docId = userType === "staff" ? user.email : user.id;
        if (docId) {
          const docRef = collectionRef.doc(docId);
          batch.set(docRef, user);
        }
      });
      await batch.commit();
      return res.status(200).json({success: true, message: `Successfully imported ${users.length} ${userType} records.`});
    } else {
      return res.status(400).json({success: false, message: "Invalid action specified."});
    }
  } catch (error) {
    console.error(`Error during ${userType} database update:`, error);
    return res.status(500).json({success: false, message: `Server Error: ${error.message}`});
  }
};
