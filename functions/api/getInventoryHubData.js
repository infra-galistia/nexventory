const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {
  getUsersRef,
  getSettingsRef,
  getInventoryRef,
  getProjectKitsRef,
  getOrderRequestsRef,
} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  let userRole = "Standard";
  let userPermissions = {};

  // --- NEW: Authentication and Organization ID check ---
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({error: "Unauthorized: No token provided."});
  }
  const {organizationId} = req.body;
  if (!organizationId) {
    return res.status(400).json({error: "Bad Request: organizationId is required."});
  }

  const idToken = req.headers.authorization.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // --- UPDATED PERMISSION LOGIC ---
    // Fetch user and permission data from within the specific organization
    const userDoc = await getUsersRef(organizationId).doc(uid).get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      userRole = userData.role || "Standard";

      const permissionsDoc = await getSettingsRef(organizationId).doc("permissions").get();
      const allRolePermissions = permissionsDoc.exists ? permissionsDoc.data() : {};

      const basePermissionsArray = allRolePermissions[userRole] || [];
      userPermissions = basePermissionsArray.reduce((map, perm) => {
        map[perm] = true;
        return map;
      }, {});

      const userOverrides = userData.permissionOverrides || {};
      Object.assign(userPermissions, userOverrides);

      if (userRole === "Master Admin") {
        const allPermissionKeys = [
          "canManageInventory", "canBuildKits", "canManageLocations",
          "canManageOrderRequests", "canGenerateLabels", "canManageUsers",
          "canManageDatabases", "canManageDepartments", "canTransfer",
          "canLogDamaged", "canLogLost", "canExportData", "canEditItems",
        ];
        allPermissionKeys.forEach((key) => userPermissions[key] = true);
      }
    }
    // --- END UPDATED PERMISSION LOGIC ---

    // --- UPDATED: Use helper functions for scoped data access ---
    const [inventorySnapshot, kitsSnapshot, ordersSnapshot, dropdownsDoc] = await Promise.all([
      getInventoryRef(organizationId).get(),
      getProjectKitsRef(organizationId).get(),
      getOrderRequestsRef(organizationId).orderBy("requestDate", "desc").get(),
      getSettingsRef(organizationId).doc("dropdowns").get(),
    ]);

    const allItems = inventorySnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));

    const allKits = {};
    kitsSnapshot.forEach((doc) => {
      const component = doc.data();
      const kitName = component.kitName;
      if (!allKits[kitName]) {
        allKits[kitName] = {
          kitName: kitName,
          kitBarcode: component.kitBarcode,
          kitQuantity: component.kitQuantity,
          components: [],
        };
      }
      allKits[kitName].components.push({
        barcode: component.barcode,
        itemName: component.itemName,
        quantity: component.quantity,
      });
    });

    const orderRequests = ordersSnapshot.docs.map((doc) => {
      const data = doc.data();
      const requestDate = data.requestDate?.toDate ? data.requestDate.toDate().toISOString() : null;
      const processedDate = data.processedDate?.toDate ? data.processedDate.toDate().toISOString() : null;
      return {id: doc.id, ...data, requestDate, processedDate};
    });

    const dropdowns = dropdownsDoc.exists ? dropdownsDoc.data() : {Departments: [], Purpose: []};

    res.status(200).json({
      userRole,
      userPermissions,
      allItems,
      allKits: Object.values(allKits),
      orderRequests,
      dropdowns,
    });
  } catch (error) {
    console.error("Error fetching Inventory Hub data:", error);
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({error: "Token expired, please log in again."});
    }
    res.status(500).json({error: "Failed to fetch Inventory Hub data."});
  }
};
