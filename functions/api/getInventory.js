// in functions/api/getInventory.js

const admin = require("firebase-admin");
const {getInventoryRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Fetches the entire inventory list for a specific organization.
 */
module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized"});
  }

  // organizationId is now required. It should be sent in the POST body.
  const {organizationId} = req.body;
  if (!organizationId) {
    return res.status(400).json({success: false, message: "Organization ID is required."});
  }

  try {
    // Use the helper to get a reference to the correct organization's inventory
    const inventorySnapshot = await getInventoryRef(organizationId).get();

    if (inventorySnapshot.empty) {
      return res.status(200).send([]);
    }

    const allItems = inventorySnapshot.docs.map((doc) => {
      return {
        id: doc.id, // Use the document ID for consistency
        Barcode: doc.data().Barcode || doc.id,
        ...doc.data(),
      };
    });

    res.status(200).send(allItems);
  } catch (error) {
    console.error("Error fetching inventory:", error);
    res.status(500).send({success: false, message: "Failed to fetch inventory."});
  }
};
