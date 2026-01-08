const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
// --- NEW: Import the centralized data access helpers ---
const {getInventoryRef, getTransactionsRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

// Helper to parse different location string formats. Stays here for now as it's specific to building the zoneData object.
function _parseLocationString(locationString) {
  if (!locationString || typeof locationString !== "string") return null;
  const str = locationString.trim();
  const delimiterIndex = str.indexOf(" - ");
  if (delimiterIndex !== -1) {
    const zone = str.substring(0, delimiterIndex).trim();
    const row = str.substring(delimiterIndex + 3).trim();
    if (zone && row) return {zone, row};
  }
  const keywords = ["Row", "Shelf", "Cabinet", "Bin"];
  let splitIndex = -1;
  for (const keyword of keywords) {
    const index = str.lastIndexOf(` ${keyword}`);
    if (index > 0) {
      splitIndex = index;
      break;
    }
  }
  if (splitIndex !== -1) {
    const zone = str.substring(0, splitIndex).trim();
    const row = str.substring(splitIndex + 1).trim();
    if (zone && row) return {zone, row};
  }
  return null;
}


module.exports = async (req, res) => {
  // --- NEW: Authentication and Organization ID check ---
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({error: "Unauthorized: No token provided."});
  }
  const {organizationId} = req.body;
  if (!organizationId) {
    return res.status(400).json({error: "Bad Request: organizationId is required."});
  }

  try {
    // Verify token to ensure user is authenticated.
    const idToken = req.headers.authorization.split("Bearer ")[1];
    await admin.auth().verifyIdToken(idToken);

    // --- UPDATED: Use helper functions for scoped data access ---
    const inventoryPromise = getInventoryRef(organizationId).get();
    const transactionsPromise = getTransactionsRef(organizationId).orderBy("timestamp", "desc").limit(25).get();

    const [inventorySnapshot, transactionSnapshot] = await Promise.all([inventoryPromise, transactionsPromise]);

    let totalItemTypes = 0;
    let itemsOut = 0;
    let itemsAttention = 0;
    const zoneData = {};
    const itemBarcodeMap = new Map();

    inventorySnapshot.forEach((doc) => {
      const item = doc.data();
      const barcode = item.Barcode || item.barcode || doc.id;
      itemBarcodeMap.set(barcode, item.itemName || "Unknown Item");

      totalItemTypes++;

      const total = parseInt(item.totalStock) || 0;
      const current = parseInt(item.currentStock) || 0;
      const quantityOut = total - current;
      if (quantityOut > 0) {
        itemsOut += quantityOut;
      }

      if (item.loanStatus === "Lost" || item.loanStatus === "Damaged") itemsAttention++;

      const room = item.storageRoom || "Uncategorized";
      const locationString = item.location || item.storageRoom;
      const parsed = _parseLocationString(locationString);

      if (parsed) {
        const {zone, row} = parsed;
        if (!zoneData[room]) zoneData[room] = {};
        if (!zoneData[room][zone]) zoneData[room][zone] = {};
        if (!zoneData[room][zone][row]) zoneData[room][zone][row] = {name: row, items: []};

        zoneData[room][zone][row].items.push({
          name: item.itemName || "Unnamed Item",
          status: (item.currentStock || 0) > 0 ? "present" : "missing",
        });
      }
    });

    const summary = {totalItemTypes, itemsOut, itemsAttention};

    const activity = transactionSnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
    const popularItemsCounter = {};

    activity.forEach((tx) => {
      if (tx.type && tx.type.toLowerCase().includes("out") && tx.items) {
        tx.items.forEach((txItem) => {
          const barcode = txItem.item?.Barcode || txItem.item?.barcode;
          if (barcode) {
            const itemName = itemBarcodeMap.get(barcode) || `Item ${barcode}`;
            popularItemsCounter[itemName] = (popularItemsCounter[itemName] || 0) + (txItem.quantity || 1);
          }
        });
      }
    });

    const popularItems = Object.entries(popularItemsCounter)
        .sort(([, a], [, b]) => b-a)
        .slice(0, 5)
        .map(([name, count]) => ({name, count}));

    const userItems = [];

    res.status(200).send({summary, popularItems, activity, userItems, zoneData});
  } catch (error) {
    console.error("Error in getDashboardData:", error);
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({error: "Token expired, please log in again."});
    }
    res.status(500).send({error: "Failed to fetch dashboard data."});
  }
};
