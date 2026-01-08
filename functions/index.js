/**
 * Main entry point for all Firebase Cloud Functions.
 * FIXES: CORS support, V1 Auth Triggers, and "First User" Logic.
 */

const {onRequest} = require("firebase-functions/v2/https");
// Use V1 for Auth Triggers to ensure stability and avoid "undefined" errors
const v1 = require("firebase-functions/v1");
const {setGlobalOptions} = require("firebase-functions/v2");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// Set the region for all functions
setGlobalOptions({region: "us-central1"});

admin.initializeApp();
const app = express();

// 1. Apply CORS globally
app.use(cors({origin: true}));
app.use(express.json());

// 2. Authentication Middleware (CORS FIX INCLUDED)
const authenticate = async (req, res, next) => {
  // FIX: Allow Browser Pre-checks (OPTIONS) to pass without a token
  if (req.method === "OPTIONS") {
    return next();
  }

  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    // Force CORS headers even on error
    res.set("Access-Control-Allow-Origin", "*");
    return res.status(403).send("Unauthorized");
  }

  const idToken = req.headers.authorization.split("Bearer ")[1];
  try {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedIdToken;
    next();
  } catch (e) {
    res.set("Access-Control-Allow-Origin", "*");
    res.status(403).send("Unauthorized");
  }
};

// Apply middleware to all routes except public ones
app.use((req, res, next) => {
  if (req.path === "/createNewOrganization") return next();
  authenticate(req, res, next);
});

// --- API Route Imports ---
const getDashboardDataHandler = require("./api/getDashboardData");
const getInventoryHandler = require("./api/getInventory");
const getOperationsPageDataHandler = require("./api/getOperationsPageData");
const getSearchPageDataHandler = require("./api/getSearchPageData");
const logLostOrDamagedItemHandler = require("./api/logLostOrDamagedItem");
const getSessionInfoHandler = require("./api/getSessionInfo");
const processBulkCheckoutHandler = require("./api/processBulkCheckout");
const processCheckinHandler = require("./api/processCheckin");
const processCheckoutHandler = require("./api/processCheckout");
const processIntradepartmentTransferHandler = require("./api/processIntradepartmentTransfer");
const resetTransactionsHandler = require("./api/resetTransactions");
const getAdminSettingsDataHandler = require("./api/getAdminSettingsData");
const updateUserSettingsHandler = require("./api/updateUserSettings");
const updateUserDatabasesHandler = require("./api/updateUserDatabases");
const updateAdminSettingsHandler = require("./api/updateAdminSettings");
const getInventoryHubDataHandler = require("./api/getInventoryHubData");
const updateInventoryHandler = require("./api/updateInventory");
const updateKitsHandler = require("./api/updateKits");
const updateOrderRequestHandler = require("./api/updateOrderRequest");
const scrapeUrlHandler = require("./api/scrapeUrl");
const updateUserPermissionsHandler = require("./api/updateUserPermissions");
const submitFeedbackHandler = require("./api/submitFeedback");
const getDataForReportHandler = require("./api/getDataForReport");
const exportToCsvHandler = require("./api/exportToCsv");
const getUserProfileDataHandler = require("./api/getUserProfileData");
const updateUserProfileHandler = require("./api/updateUserProfile");
const createNewOrganizationHandler = require("./api/createNewOrganization");
const changeMasterAdminHandler = require("./api/changeMasterAdmin");

// --- API Route Definitions ---
app.post("/getSessionInfo", getSessionInfoHandler);
app.post("/getDashboardData", getDashboardDataHandler);
app.post("/getInventory", getInventoryHandler);
app.post("/getOperationsPageData", getOperationsPageDataHandler);
app.post("/getSearchPageData", getSearchPageDataHandler);
app.post("/getAdminSettingsData", getAdminSettingsDataHandler);
app.post("/getInventoryHubData", getInventoryHubDataHandler);
app.post("/getDataForReport", getDataForReportHandler);
app.post("/getUserProfileData", getUserProfileDataHandler);
app.post("/logLostOrDamagedItem", logLostOrDamagedItemHandler);
app.post("/processBulkCheckout", processBulkCheckoutHandler);
app.post("/processCheckin", processCheckinHandler);
app.post("/processCheckout", processCheckoutHandler);
app.post("/processIntradepartmentTransfer", processIntradepartmentTransferHandler);
app.post("/updateUserSettings", updateUserSettingsHandler);
app.post("/updateUserDatabases", updateUserDatabasesHandler);
app.post("/updateAdminSettings", updateAdminSettingsHandler);
app.post("/updateInventory", updateInventoryHandler);
app.post("/updateKits", updateKitsHandler);
app.post("/updateOrderRequest", updateOrderRequestHandler);
app.post("/scrapeUrl", scrapeUrlHandler);
app.post("/updateUserPermissions", updateUserPermissionsHandler);
app.post("/submitFeedback", submitFeedbackHandler);
app.post("/exportToCsv", exportToCsvHandler);
app.post("/updateUserProfile", updateUserProfileHandler);
app.post("/resetTransactions", resetTransactionsHandler);
app.post("/createNewOrganization", createNewOrganizationHandler);
app.post("/changeMasterAdmin", changeMasterAdminHandler);

// --- EXPORT THE API ---
exports.api = onRequest(app);

// --- SMART USER SETUP TRIGGER (Internalized to avoid file errors) ---
const setCustomClaimsHandler = async (user) => {
    console.log("Processing new user:", user.email);
    const db = admin.firestore();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    try {
        // Check if ANY Organization exists in the database
        const orgsSnapshot = await db.collection("organizations").get();
        
        if (orgsSnapshot.empty) {
            // === SCENARIO A: FIRST USER (The Master Admin) ===
            console.log("No organizations found. Creating System Root for:", user.email);
            const newOrgId = "NexVentory-HQ";

            await db.collection("organizations").doc(newOrgId).set({
                name: "Main Organization",
                type: "Master",
                createdAt: timestamp,
                createdBy: user.uid
            });

            await admin.auth().setCustomUserClaims(user.uid, { 
                organizationId: newOrgId,
                role: "Master Admin"
            });

            await db.collection("organizations").doc(newOrgId).collection("users").doc(user.uid).set({
                email: user.email,
                displayName: user.displayName || "Master Admin",
                role: "Master Admin",
                status: "active",
                createdAt: timestamp
            });
            console.log("SUCCESS: Master Admin Created.");
        } else {
            // === SCENARIO B: REGULAR USER ===
            console.log("Organization exists. Adding new user as PENDING.");
            const firstOrg = orgsSnapshot.docs[0];
            const orgId = firstOrg.id;

            await admin.auth().setCustomUserClaims(user.uid, { 
                organizationId: orgId,
                role: "User" 
            });

            await db.collection("organizations").doc(orgId).collection("users").doc(user.uid).set({
                email: user.email,
                displayName: user.displayName || "New User",
                role: "User",
                status: "pending",
                createdAt: timestamp
            });
            console.log("SUCCESS: User added as Pending.");
        }
    } catch (error) {
        console.error("Error in onUserCreate:", error);
    }
    return;
};

// Export the Auth Trigger using V1 syntax
exports.onUserCreate = v1.auth.user().onCreate(setCustomClaimsHandler);