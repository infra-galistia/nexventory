const admin = require("firebase-admin");
// --- NEW: Import the centralized data access helpers ---
const {getGlobalLayoutFromCache, getInventoryRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

const toCamelCase = (s) => {
  if (typeof s !== "string") return s;
  const str = s.charAt(0).toLowerCase() + s.slice(1);
  return str.replace(/ (\w)/g, (_, c) => c.toUpperCase());
};

const getSearchPageData = async (req, res) => {
  // --- NEW: Authentication and Organization ID check ---
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({error: "Unauthorized: No token provided."});
  }
  const {organizationId} = req.body;
  if (!organizationId) {
    return res.status(400).json({error: "Bad Request: organizationId is required."});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    await admin.auth().verifyIdToken(idToken);

    // --- UPDATED: Use the helper for a scoped inventory query ---
    const inventorySnapshot = await getInventoryRef(organizationId).get();

    const allItems = inventorySnapshot.docs.map((doc) => {
      const data = doc.data();
      const camelCaseData = {};
      const correctBarcode = data.barcode || data.Barcode || doc.id;

      for (const key in data) {
        if (key.toLowerCase() === "barcode") continue;
        camelCaseData[toCamelCase(key)] = data[key];
      }

      return {id: doc.id, ...camelCaseData, Barcode: correctBarcode};
    });

    const dbCacheForLayout = {inventory: inventorySnapshot.docs.map((doc) => doc.data())};
    const layoutConfig = getGlobalLayoutFromCache(dbCacheForLayout);

    return res.status(200).json({
      allItems: allItems,
      layoutConfig: layoutConfig,
    });
  } catch (error) {
    console.error("Error in getSearchPageData:", error);
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({error: "Token expired, please log in again."});
    }
    return res.status(500).json({error: "Failed to load search page data."});
  }
};

module.exports = getSearchPageData;
