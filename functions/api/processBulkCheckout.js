const admin = require("firebase-admin");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getInventoryRef, getTransactionsRef, getUsersRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized"});
  }

  const {items, context, organizationId} = req.body;
  if (!items || !context || !context.projectName || !context.assignedTo || !organizationId) {
    return res.status(400).send({success: false, message: "Invalid bulk checkout data or missing organizationId."});
  }

  const batchId = `B-${Date.now()}`;

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDoc = await getUsersRef(organizationId).doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({success: false, message: "User not found."});
    }
    const userEmail = userDoc.data().email;

    await db.runTransaction(async (transaction) => {
      const inventoryRef = getInventoryRef(organizationId);

      // --- FIX START: Query for all components at once ---
      const componentBarcodes = items.map((c) => c.barcode);
      const query = inventoryRef.where("Barcode", "in", componentBarcodes);
      const snapshot = await transaction.get(query);

      const docMap = new Map();
      snapshot.docs.forEach((doc) => {
        docMap.set(doc.data().Barcode, doc);
      });
      // --- FIX END ---

      const updates = [];
      for (const component of items) {
        const doc = docMap.get(component.barcode);
        if (!doc || !doc.exists) {
          throw new Error(`Component item with barcode "${component.barcode}" not found.`);
        }

        const data = doc.data();
        if ((data.currentStock || 0) < component.quantity) {
          throw new Error(`Insufficient stock for "${data.itemName}". Requested: ${component.quantity}, Available: ${data.currentStock}.`);
        }
        updates.push({
          ref: doc.ref,
          data: {
            currentStock: data.currentStock - component.quantity,
            loanStatus: "Out",
            assignedTo: context.assignedTo,
            lastTransactionDate: FieldValue.serverTimestamp(),
            lastTransactionBy: userEmail,
            lastTransactionType: "Bulk Component-Out",
          },
        });
      }

      updates.forEach((update) => transaction.update(update.ref, update.data));

      const kitLogRef = getTransactionsRef(organizationId).doc();
      transaction.set(kitLogRef, {
        batchId,
        timestamp: FieldValue.serverTimestamp(),
        user: userEmail,
        type: "Bulk Checkout - Kit",
        itemName: context.projectName,
        quantity: context.numKits,
        assignedTo: context.assignedTo,
        context: context,
        notes: context.notes || "",
      });
    });

    res.status(200).send({success: true, message: `Successfully checked out ${context.numKits} set(s) of project "${context.projectName}".`});
  } catch (error) {
    console.error("Bulk Checkout transaction failed:", error);
    res.status(500).send({success: false, message: `Transaction Failed: ${error.message}`});
  }
};
