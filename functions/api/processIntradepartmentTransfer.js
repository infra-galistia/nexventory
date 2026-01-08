const admin = require("firebase-admin");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getInventoryRef, getTransactionsRef, getUsersRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized: No token provided."});
  }

  const {items, toDept, newStorageRoom, newLocation, notes, organizationId} = req.body;

  if (!items || !toDept || !newLocation || !organizationId) {
    return res.status(400).send({success: false, message: "Missing required transfer data or organizationId."});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDoc = await getUsersRef(organizationId).doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({success: false, message: "User not found in this organization."});
    }
    const userEmail = userDoc.data().email || "Unknown User";

    const inventoryRef = getInventoryRef(organizationId);
    const transactionsRef = getTransactionsRef(organizationId);
    const batchId = `B-${Date.now()}`;

    // --- FIX START: Query for all items first to ensure they exist ---
    const itemBarcodes = items.map((item) => item.barcode);
    const query = inventoryRef.where("Barcode", "in", itemBarcodes);
    const snapshot = await query.get();

    if (snapshot.size !== items.length) {
      throw new Error("One or more items in the transfer request could not be found.");
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        currentDepartment: toDept,
        storageRoom: newStorageRoom,
        location: newLocation,
        lastTransactionType: "Intra-Department Transfer",
        lastTransactionDate: FieldValue.serverTimestamp(),
        lastTransactionBy: userEmail,
      });
    });
    // --- FIX END ---

    const logRef = transactionsRef.doc();
    batch.set(logRef, {
      batchId,
      timestamp: FieldValue.serverTimestamp(),
      type: "Intra-Department Transfer",
      user: userEmail,
      items: items.map((i) => ({
        item: {Barcode: i.barcode, itemName: i.itemName},
        quantity: i.quantity,
      })),
      notes: `Transferred to ${toDept}. ${notes || ""}`,
    });

    await batch.commit();
    res.status(200).send({success: true, message: "Items transferred successfully."});
  } catch (error) {
    console.error("Intra-Department Transfer failed:", error);
    res.status(500).send({success: false, message: `Transfer Failed: ${error.message}`});
  }
};
