const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
// --- NEW: Import the centralized data access helpers ---
const {
  getInventoryRef,
  getStaffRef,
  getStudentsRef,
  getTransactionsRef,
  getSettingsRef,
  getGlobalLayoutFromCache, // Import the centralized helper
} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

const toCamelCase = (s) => {
  const str = s.charAt(0).toLowerCase() + s.slice(1);
  return str.replace(/ (\w)/g, (_, c) => c.toUpperCase());
};

// --- REMOVED: The local getGlobalLayoutFromCache function is no longer needed. ---

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
    const idToken = req.headers.authorization.split("Bearer ")[1];
    await admin.auth().verifyIdToken(idToken);

    // --- UPDATED: Use helper functions for scoped data access ---
    const inventoryPromise = getInventoryRef(organizationId).get();
    const staffPromise = getStaffRef(organizationId).get();
    const studentPromise = getStudentsRef(organizationId).get();
    const transactionsPromise = getTransactionsRef(organizationId).orderBy("timestamp", "asc").get();
    const dropdownsPromise = getSettingsRef(organizationId).doc("dropdowns").get();

    const [
      inventorySnapshot,
      staffSnapshot,
      studentSnapshot,
      transactionsSnapshot,
      dropdownsSnapshot,
    ] = await Promise.all([
      inventoryPromise,
      staffPromise,
      studentPromise,
      transactionsPromise,
      dropdownsPromise,
    ]);

    // The rest of the data processing logic remains the same, as it now operates
    // on the organization-specific data fetched above.
    const allItems = inventorySnapshot.docs.map((doc) => {
      const data = doc.data();
      const camelCaseData = {};
      const correctBarcode = data.barcode || data.Barcode || doc.id;
      for (const key in data) {
        if (key.toLowerCase() === "barcode") continue;
        const value = data[key];
        if (value && typeof value.toDate === "function") {
          camelCaseData[toCamelCase(key)] = value.toDate().toISOString();
        } else {
          camelCaseData[toCamelCase(key)] = value;
        }
      }
      camelCaseData.currentDepartment = camelCaseData.currentDepartment || camelCaseData.department;
      return {id: doc.id, ...camelCaseData, Barcode: correctBarcode};
    });

    const allItemsMap = new Map(allItems.map((item) => [item.Barcode, item]));
    const staffList = staffSnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
    const studentList = studentSnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));

    const itemStateMap = new Map();
    const transactions = transactionsSnapshot.docs.map((doc) => doc.data());

    for (const tx of transactions) {
      const type = tx.type || "";
      if (type.includes("Check-In") || type.includes("checkin")) {
        if (tx.barcode) {
          const currentState = itemStateMap.get(tx.barcode);
          if (currentState && currentState.status === "OUT") {
            const remainingQuantity = (currentState.quantity || 0) - (tx.quantity || 0);
            if (remainingQuantity <= 0) {
              itemStateMap.set(tx.barcode, {status: "IN"});
            } else {
              currentState.quantity = remainingQuantity;
              itemStateMap.set(tx.barcode, currentState);
            }
          }
        }
        continue;
      }
      if (type === "Bulk Checkout - Kit") {
        const kitDef = allItems.find((item) => item.itemName === tx.context?.projectName);
        const numKits = parseInt(tx.context?.numKits || tx.quantity || 1);
        if (kitDef && kitDef.components) {
          for (const comp of kitDef.components) {
            const existingState = itemStateMap.get(comp.barcode);
            if (existingState && existingState.type === "individual") continue;
            const componentQty = (parseInt(comp.requiredQty) || 1) * numKits;
            itemStateMap.set(comp.barcode, {
              status: "OUT", type: "kit", assignedTo: tx.context?.assignedTo,
              kitName: tx.context?.projectName, batchId: tx.batchId,
              quantity: componentQty, numKits: numKits,
              transactionDate: tx.timestamp.toDate(), transactionBy: tx.user,
            });
          }
        }
        continue;
      }
      if (Array.isArray(tx.items) && tx.context?.assignedTo) {
        for (const checkoutItem of tx.items) {
          const barcode = checkoutItem.item?.Barcode;
          if (barcode) {
            itemStateMap.set(barcode, {
              status: "OUT", type: "individual", assignedTo: tx.context.assignedTo,
              quantity: checkoutItem.quantity,
              transactionDate: tx.timestamp.toDate(), transactionBy: tx.user,
            });
          }
        }
      }
    }

    const individualOutItems = [];
    const bulkReturnData = {};
    const usersWithIndividualCheckouts = new Set();
    const usersWithKitCheckouts = new Set();

    itemStateMap.forEach((state, barcode) => {
      if (state.status === "OUT") {
        const originalItem = allItemsMap.get(barcode);
        if (!originalItem) return;
        const currentItem = {...originalItem, assignedTo: state.assignedTo, lastTransactionDate: state.transactionDate, lastTransactionBy: state.transactionBy, loanStatus: "OUT", transactionQuantity: state.quantity};
        if (state.type === "individual") {
          if (state.assignedTo) usersWithIndividualCheckouts.add(state.assignedTo);
          individualOutItems.push(currentItem);
        } else if (state.type === "kit") {
          if (state.assignedTo) usersWithKitCheckouts.add(state.assignedTo);
          if (!bulkReturnData[state.assignedTo]) bulkReturnData[state.assignedTo] = [];
          let kitBatch = bulkReturnData[state.assignedTo].find((k) => k.batchId === state.batchId);
          if (!kitBatch) {
            kitBatch = {kitName: state.kitName, batchId: state.batchId, checkoutUser: state.transactionBy, checkoutTimestamp: state.transactionDate, numKits: state.numKits, components: []};
            bulkReturnData[state.assignedTo].push(kitBatch);
          }
          kitBatch.components.push(currentItem);
        }
      }
    });

    const checkinData = {individualItems: individualOutItems, usersWithCheckouts: [...usersWithIndividualCheckouts].sort(), usersWithKitCheckouts: [...usersWithKitCheckouts].sort(), bulkReturnData: bulkReturnData};

    // Use the centralized layout generator
    const dbCacheForLayout = {inventory: inventorySnapshot.docs.map((doc) => doc.data())};

    const responseData = {
      allItems, staffList, studentList, checkinData,
      projectSummaries: allItems.filter((item) => item.isKit),
      dropdowns: dropdownsSnapshot.exists ? dropdownsSnapshot.data() : {Departments: [], Purpose: [], DepartmentMap: {}},
      layoutConfig: getGlobalLayoutFromCache(dbCacheForLayout),
    };

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("CRITICAL ERROR in getOperationsPageData:", error);
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({error: "Token expired, please log in again."});
    }
    return res.status(500).json({error: "Server-side error.", details: error.message});
  }
};
