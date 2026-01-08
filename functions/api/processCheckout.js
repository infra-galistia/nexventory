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

  const {items, context, organizationId} = req.body;

  if (!items || !context || items.length === 0 || !organizationId) {
    return res.status(400).send({success: false, message: "Invalid transaction data provided. Missing items, context, or organizationId."});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDoc = await getUsersRef(organizationId).doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({success: false, message: "User performing the action not found in this organization."});
    }
    const userEmail = userDoc.data().email || "Unknown User";

    const batchId = `B-${Date.now()}`;

    await db.runTransaction(async (transaction) => {
      const validationPromises = items.map(async (cartItem) => {
        const itemBarcode = cartItem.item.Barcode;

        // --- FIX START: Query for the item instead of getting by ID ---
        const inventoryRef = getInventoryRef(organizationId);
        const query = inventoryRef.where("Barcode", "==", itemBarcode);
        const snapshot = await transaction.get(query);

        if (snapshot.empty) {
          throw new Error(`Item with barcode "${itemBarcode}" not found in this organization.`);
        }

        const itemDoc = snapshot.docs[0];
        const itemRef = itemDoc.ref; // Get the correct reference from the document found
        // --- FIX END ---

        const itemData = itemDoc.data();
        const currentStock = itemData.currentStock || 0;
        if (currentStock < cartItem.quantity) {
          throw new Error(`Insufficient stock for "${itemData.itemName}". Requested: ${cartItem.quantity}, Available: ${currentStock}.`);
        }

        const newStock = currentStock - cartItem.quantity;
        transaction.update(itemRef, {
          currentStock: newStock,
          loanStatus: "Out",
          assignedTo: context.assignedTo,
          lastTransactionDate: FieldValue.serverTimestamp(),
          lastTransactionBy: userEmail,
          lastTransactionType: "Check-Out",
        });
      });

      await Promise.all(validationPromises);

      const logRef = getTransactionsRef(organizationId).doc();
      transaction.set(logRef, {
        batchId: batchId,
        timestamp: FieldValue.serverTimestamp(),
        user: userEmail,
        type: "Check-Out",
        items: items,
        context: context,
      });
    });

    res.status(200).send({success: true, message: `Successfully checked out ${items.length} item type(s) to ${context.assignedTo}.`});
  } catch (error) {
    console.error("Checkout transaction failed:", error);
    res.status(500).send({success: false, message: `Transaction Failed: ${error.message}`});
  }
};
