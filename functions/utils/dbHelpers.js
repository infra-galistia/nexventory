// functions/utils/dbHelpers.js
const admin = require("firebase-admin");
const db = admin.firestore();

// --- NEW: Path Helper Functions for Multi-Tenancy (Task 3.1) ---
// These functions centralize the logic for accessing organization-specific subcollections.

// --- FIX #1: ADD THE MISSING getOrganizationsRef FUNCTION ---
const getOrganizationsRef = () => db.collection("organizations");
// --- END OF FIX ---

const getInventoryRef = (orgId) => db.collection("organizations").doc(orgId).collection("inventory");
const getUsersRef = (orgId) => db.collection("organizations").doc(orgId).collection("users");
const getTransactionsRef = (orgId) => db.collection("organizations").doc(orgId).collection("transactions");
const getStaffRef = (orgId) => db.collection("organizations").doc(orgId).collection("staff");
const getStudentsRef = (orgId) => db.collection("organizations").doc(orgId).collection("students");
const getSettingsRef = (orgId) => db.collection("organizations").doc(orgId).collection("settings");
const getProjectKitsRef = (orgId) => db.collection("organizations").doc(orgId).collection("projectKits");
const getOrderRequestsRef = (orgId) => db.collection("organizations").doc(orgId).collection("orderRequests");


/**
 * Fetches a complete cache of essential database collections for a specific organization.
 * @param {string} organizationId - The ID of the organization to fetch data for.
 * @return {Promise<object>} A cache object with data from the specified organization.
 */
async function getOrgDatabaseCache(organizationId) {
  if (!organizationId) {
    throw new Error("organizationId is required to get database cache.");
  }
  const collections = ["inventory", "staff", "students"];
  const promises = collections.map(async (collectionName) => {
    // Query the subcollection within the specified organization
    const snapshot = await db.collection("organizations").doc(organizationId).collection(collectionName).get();
    return {
      name: collectionName,
      data: snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()})),
    };
  });
  const results = await Promise.all(promises);
  const dbCache = {};
  results.forEach((result) => {
    dbCache[result.name] = result.data;
  });
  return dbCache;
}

// --- The following functions remain as they are, as they process the cache ---
// --- object, which now contains organization-specific data.            ---

function processAllItemsFromCache(dbCache) {
  return dbCache["inventory"] || [];
}

function _parseLocationString(locationString) {
  if (!locationString || typeof locationString !== "string") {
    return null;
  }
  const str = locationString.trim();
  const delimiterIndex = str.indexOf(" - ");
  if (delimiterIndex !== -1) {
    const zone = str.substring(0, delimiterIndex).trim();
    const row = str.substring(delimiterIndex + 3).trim(); // +3 to skip ' - '
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
    const row = str.substring(splitIndex + 1).trim(); // +1 to skip the leading space
    if (zone && row) return {zone, row};
  }
  return null;
}

function getGlobalLayoutFromCache(dbCache) {
  const inventoryData = dbCache["inventory"] || [];
  const defaultZones = ["Zone A", "Zone B", "Zone C", "Zone D", "Zone E", "Zone F"];
  const defaultRows = ["Row 1", "Row 2", "Row 3", "Row 4", "Row 5"];
  const zoneSet = new Set(defaultZones);
  const rowSet = new Set(defaultRows);

  inventoryData.forEach((item) => {
    const locationString = item.location || item.storageRoom;
    const parsed = _parseLocationString(locationString);
    if (parsed) {
      zoneSet.add(parsed.zone);
      rowSet.add(parsed.row);
    }
  });

  const sortedZones = Array.from(zoneSet).sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
  const sortedRows = Array.from(rowSet).sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
  return {zones: sortedZones, rows: sortedRows};
}

function processStaffListFromCache(dbCache) {
  const staffData = dbCache["staff"] || [];
  return staffData.map((p) => ({name: p.name, email: p.email}));
}

function processStudentListFromCache(dbCache) {
  const studentData = dbCache["students"] || [];
  return studentData.map((s) => ({id: s.id, name: s.name, email: s.email || ""}));
}

function processDropdownsFromCache(dbCache) {
  const inventory = dbCache["inventory"] || [];
  const programs = [...new Set(inventory.map((item) => item.program).filter(Boolean))];
  return {Programs: programs.sort()};
}

function processCheckinDataFromCache(dbCache) {
  const inventory = dbCache["inventory"] || [];
  const outItems = inventory.filter((item) => item.loanStatus !== "IN" && item.assignedTo);
  const usersWithCheckouts = [...new Set(outItems.map((item) => item.assignedTo))];
  return {
    individualItems: outItems,
    usersWithCheckouts: usersWithCheckouts.sort(),
    bulkReturnData: {},
  };
}

function processProjectSummariesFromCache(dbCache) {
  return [];
}

module.exports = {
  // --- FIX #2: ADD THE MISSING FUNCTION TO THE EXPORTS ---
  getOrganizationsRef,
  // --- END OF FIX ---

  // New path helpers
  getInventoryRef,
  getUsersRef,
  getTransactionsRef,
  getStaffRef,
  getStudentsRef,
  getSettingsRef,
  getProjectKitsRef,
  getOrderRequestsRef,
  // Renamed cache function
  getOrgDatabaseCache,
  // Existing processing functions
  processAllItemsFromCache,
  getGlobalLayoutFromCache,
  processStaffListFromCache,
  processStudentListFromCache,
  processDropdownsFromCache,
  processCheckinDataFromCache,
  processProjectSummariesFromCache,
};
