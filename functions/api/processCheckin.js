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

  const {mode, notes, organizationId, ...data} = req.body;

  if (!mode || !organizationId || (mode !== "individual" && mode !== "project")) {
    return res.status(400).json({success: false, message: "Invalid check-in mode or missing organizationId."});
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

    await db.runTransaction(async (transaction) => {
      const batchId = `B-${Date.now()}`;
      const inventoryRef = getInventoryRef(organizationId);
      const transactionsRef = getTransactionsRef(organizationId);

      if (mode === "individual") {
        const {itemBarcode, quantity, context} = data;
        if (!itemBarcode || !quantity) throw new Error("Invalid item data provided.");

        // --- FIX START: Query for the item by its Barcode field ---
        const query = inventoryRef.where("Barcode", "==", itemBarcode);
        const snapshot = await transaction.get(query);

        if (snapshot.empty) {
          throw new Error(`Item with barcode "${itemBarcode}" not found.`);
        }
        const itemDoc = snapshot.docs[0];
        const itemRef = itemDoc.ref;
        // --- FIX END ---

        const itemData = itemDoc.data();
        const newStock = Math.min(itemData.totalStock || 0, (itemData.currentStock || 0) + quantity);

        transaction.update(itemRef, {
          currentStock: newStock,
          assignedTo: "",
          loanStatus: "IN",
          lastTransactionDate: FieldValue.serverTimestamp(),
          lastTransactionBy: userEmail,
          lastTransactionType: "Check-In",
        });

        const logRef = transactionsRef.doc();
        transaction.set(logRef, {
          batchId, timestamp: FieldValue.serverTimestamp(), user: userEmail,
          type: "Check-In", itemName: itemData.itemName, barcode: itemBarcode,
          quantity, context: context || {}, notes: notes || "",
        });
      } else if (mode === "project") {
        const {components, projectName} = data;
        if (!components || !Array.isArray(components) || components.length === 0) {
          throw new Error("Invalid component data provided for project check-in.");
        }

        // --- FIX START: Query for all components at once using an 'in' query ---
        const componentBarcodes = components.map((c) => c.barcode);
        const query = inventoryRef.where("Barcode", "in", componentBarcodes);
        const snapshot = await transaction.get(query);

        // Create a map for easy lookup: { 'barcode123': doc, ... }
        const docMap = new Map();
        snapshot.docs.forEach((doc) => {
          docMap.set(doc.data().Barcode, doc);
        });
        // --- FIX END ---

        for (const component of components) {
          const doc = docMap.get(component.barcode); // Find the document from our map
          if (!doc || !doc.exists) {
            console.warn(`Skipping check-in for non-existent item: ${component.barcode}`);
            continue;
          }

          const itemData = doc.data();
          const quantityReturned = component.quantity;
          const newStock = Math.min(itemData.totalStock || 0, (itemData.currentStock || 0) + quantityReturned);

          transaction.update(doc.ref, {
            currentStock: newStock, assignedTo: "", loanStatus: "IN",
            lastTransactionDate: FieldValue.serverTimestamp(),
            lastTransactionBy: userEmail, lastTransactionType: "Project Check-In",
          });

          const logRef = transactionsRef.doc();
          transaction.set(logRef, {
            batchId, timestamp: FieldValue.serverTimestamp(), user: userEmail,
            type: "Project Check-In", itemName: itemData.itemName,
            barcode: component.barcode, quantity: quantityReturned,
            notes: (`Part of "${projectName}" return. ` + (notes || "")).trim(),
          });
        }
      }
    });

    res.status(200).json({success: true, message: "Check-in processed successfully."});
  } catch (error) {
    console.error("Check-in transaction failed:", error);
    res.status(500).json({success: false, message: `Transaction Failed: ${error.message}`});
  }
};
