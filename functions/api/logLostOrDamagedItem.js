const admin = require("firebase-admin");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getInventoryRef, getTransactionsRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized: No token provided."});
  }

  const {items, type, notes, user, organizationId} = req.body;

  if (!items || !type || !user || !Array.isArray(items) || items.length === 0 || !organizationId) {
    return res.status(400).json({success: false, message: "Missing required incident data or organizationId."});
  }

  try {
    await admin.auth().verifyIdToken(req.headers.authorization.split("Bearer ")[1]);

    await db.runTransaction(async (transaction) => {
      const inventoryRef = getInventoryRef(organizationId);

      const updatePromises = items.map(async (incident) => {
        const itemBarcode = incident.item.Barcode;

        // --- FIX START: Query for the item by its Barcode field ---
        const query = inventoryRef.where("Barcode", "==", itemBarcode);
        const snapshot = await transaction.get(query);

        if (snapshot.empty) {
          throw new Error(`Item "${itemBarcode}" not found in this organization.`);
        }
        const itemDoc = snapshot.docs[0];
        const itemDocRef = itemDoc.ref;
        // --- FIX END ---

        const itemData = itemDoc.data();
        const quantity = incident.quantity;

        if (itemData.currentStock < quantity) {
          throw new Error(`Insufficient stock for "${itemData.itemName}".`);
        }

        const updates = {
          currentStock: FieldValue.increment(-quantity),
          lastTransactionType: type,
          lastTransactionBy: user,
          lastTransactionDate: FieldValue.serverTimestamp(),
        };

        if (type === "Lost") {
          updates.totalStock = FieldValue.increment(-quantity);
        }
        if (itemData.currentStock - quantity <= 0) {
          updates.loanStatus = "IN";
          updates.assignedTo = "";
        }
        transaction.update(itemDocRef, updates);
      });

      await Promise.all(updatePromises);

      const logRef = getTransactionsRef(organizationId).doc();
      transaction.set(logRef, {
        timestamp: FieldValue.serverTimestamp(),
        type: type,
        user: user,
        items: items,
        notes: notes || "",
      });
    });

    res.status(200).json({success: true, message: "Incident logged successfully."});
  } catch (error) {
    console.error("Logging incident failed:", error);
    res.status(500).json({success: false, message: `Failed to log incident: ${error.message}`});
  }
};
