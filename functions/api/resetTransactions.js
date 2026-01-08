// functions/api/resetTransactions.js
const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {getInventoryRef, getTransactionsRef, getUsersRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized"});
  }
  const {organizationId} = req.body;
  if (!organizationId) {
    return res.status(400).json({success: false, message: "Organization ID is required."});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Permission Check: Must be a Master Admin for this organization
    const userDoc = await getUsersRef(organizationId).doc(uid).get();
    if (!userDoc.exists || userDoc.data().role !== "Master Admin") {
      return res.status(403).json({success: false, message: "Permission denied. Only Master Admins can perform a reset."});
    }

    console.log(`Starting master reset process for organization: ${organizationId}`);

    // Get scoped references
    const inventoryRef = getInventoryRef(organizationId);
    const transactionsRef = getTransactionsRef(organizationId);

    // Part 1: Reset Inventory Collection for the organization
    const inventorySnapshot = await inventoryRef.get();
    if (!inventorySnapshot.empty) {
      const batch = db.batch();
      inventorySnapshot.docs.forEach((doc) => {
        const itemData = doc.data();
        batch.update(doc.ref, {
          currentStock: itemData.totalStock || 0,
          loanStatus: "IN",
          assignedTo: "",
          lastTransactionDate: null,
          lastTransactionBy: "",
          lastTransactionType: "Master Reset",
        });
      });
      await batch.commit();
      console.log(`Inventory reset successful for ${inventorySnapshot.size} items in org ${organizationId}.`);
    }

    // Part 2: Clear Transactions Collection for the organization
    const transactionsSnapshot = await transactionsRef.get();
    if (!transactionsSnapshot.empty) {
      const deleteBatch = db.batch();
      transactionsSnapshot.docs.forEach((doc) => deleteBatch.delete(doc.ref));
      await deleteBatch.commit();
      console.log(`Deleted ${transactionsSnapshot.size} transactions in org ${organizationId}.`);
    }

    res.status(200).send({success: true, message: "Master Reset Completed Successfully."});
  } catch (error) {
    console.error("Master Reset Failed:", error);
    res.status(500).send({success: false, message: `Reset failed: ${error.message}`});
  }
};
