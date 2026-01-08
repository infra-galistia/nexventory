const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {getUsersRef, getProjectKitsRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

const getBarcodePrefixLogic = (itemName) => {
  if (!itemName || typeof itemName !== "string" || itemName.trim() === "") return "ERR";
  const words = itemName.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "INV";
  if (words.length === 1) return `KIT-${words[0].substring(0, 3)}`;
  if (words.length === 2) return `KIT-${words[0].substring(0, 2)}${words[1].charAt(0)}`;
  return `KIT-${words[0].charAt(0)}${words[1].charAt(0)}${words[2].charAt(0)}`;
};

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized"});
  }

  const {action, payload, organizationId} = req.body;
  if (!action || !payload || !organizationId) {
    return res.status(400).json({success: false, message: "Missing action, payload, or organizationId."});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDoc = await getUsersRef(organizationId).doc(uid).get();
    if (!userDoc.exists) {
      return res.status(403).json({success: false, message: "Permission denied. User not found."});
    }

    // This is a simplified permission check. A full RBAC check would be more robust.
    const userRole = userDoc.data().role;
    if (userRole !== "Admin" && userRole !== "Master Admin") {
      return res.status(403).json({success: false, message: "You do not have permission to manage Project Kits."});
    }

    const kitsCollection = getProjectKitsRef(organizationId);

    if (action === "saveKit") {
      const {kitName, kitBarcode, kitQuantity, components} = payload;
      const finalBarcode = kitBarcode || `${getBarcodePrefixLogic(kitName)}-${Date.now().toString().slice(-4)}`;
      const batch = db.batch();

      const querySnapshot = await kitsCollection.where("kitName", "==", kitName).get();
      querySnapshot.forEach((doc) => batch.delete(doc.ref));

      components.forEach((comp) => {
        const docRef = kitsCollection.doc();
        batch.set(docRef, {
          kitName, kitBarcode: finalBarcode, kitQuantity,
          barcode: comp.barcode, itemName: comp.itemName, quantity: comp.quantity,
        });
      });

      await batch.commit();
      return res.status(200).json({success: true, message: `Kit "${kitName}" saved successfully.`});
    }

    if (action === "deleteKit") {
      const {kitName} = payload;
      const batch = db.batch();
      const querySnapshot = await kitsCollection.where("kitName", "==", kitName).get();

      if (querySnapshot.empty) return res.status(404).json({success: false, message: "Kit not found."});

      querySnapshot.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      return res.status(200).json({success: true, message: `Kit "${kitName}" was deleted.`});
    }

    return res.status(400).json({success: false, message: "Invalid action."});
  } catch (error) {
    console.error(`Error during kit action '${action}':`, error);
    return res.status(500).json({success: false, message: `Server Error: ${error.message}`});
  }
};
