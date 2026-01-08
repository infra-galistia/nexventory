const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
// --- NEW: Import the centralized data access helpers ---
const {
  getUsersRef,
  getInventoryRef,
  getTransactionsRef,
  getStaffRef,
  getStudentsRef,
} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  // --- NEW: organizationId is now required for the permission check ---
  const {organizationId} = req.body;
  const dataType = req.query.type;

  if (!organizationId || !dataType) {
    return res.status(400).json({error: "Bad Request: organizationId and dataType are required."});
  }

  // --- Permission Check ---
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({error: "Unauthorized"});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // --- UPDATED: User lookup is now scoped to the organization ---
    const userDoc = await getUsersRef(organizationId).doc(uid).get();

    if (!userDoc.exists) {
      throw new Error("User not found in the specified organization.");
    }
    const userRole = userDoc.data().role;
    if (userRole !== "Master Admin" && userRole !== "Admin") {
      throw new Error("Permission denied. Admin role required.");
    }
  } catch (authError) {
    return res.status(403).json({error: authError.message});
  }
  // --- End Permission Check ---

  try {
    let query;
    // --- UPDATED: All queries now use helpers for organization scoping ---
    switch (dataType) {
      case "inventory":
        query = getInventoryRef(organizationId);
        break;
      case "transactions":
        query = getTransactionsRef(organizationId).orderBy("timestamp", "desc").limit(500);
        break;
      case "users":
        query = getUsersRef(organizationId).where("status", "==", "approved");
        break;
      case "staff":
        query = getStaffRef(organizationId);
        break;
      case "students":
        query = getStudentsRef(organizationId);
        break;
      default:
        return res.status(400).json({error: "Invalid data type specified."});
    }

    const snapshot = await query.get();
    const data = snapshot.docs.map((doc) => {
      const docData = doc.data();
      // Format timestamps for readability
      for (const key in docData) {
        if (docData[key] && typeof docData[key].toDate === "function") {
          docData[key] = docData[key].toDate().toLocaleString();
        }
      }
      return {id: doc.id, ...docData};
    });

    return res.status(200).json(data);
  } catch (error) {
    console.error(`Error fetching data for report '${dataType}':`, error);
    return res.status(500).json({error: "Failed to fetch report data."});
  }
};
