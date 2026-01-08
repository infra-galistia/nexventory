// /functions/api/getUserProfileData.js
const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {getUsersRef, getSettingsRef} = require("../utils/dbHelpers");

const db = getFirestore();

const ALL_PERMISSIONS_KEYS = [
  "canManageInventory", "canBuildKits", "canManageLocations",
  "canManageOrderRequests", "canGenerateLabels", "canManageUsers",
  "canManageDatabases", "canManageDepartments", "canExportData",
  "canTransfer", "canLogDamaged", "canLogLost", "canEditItems",
];

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({message: "Unauthorized"});
  }

  // organizationId is required to know where to look for the user's profile
  const {organizationId} = req.body;
  if (!organizationId) {
    return res.status(400).json({message: "Organization ID is required."});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const {uid, email, name} = decodedToken;

    // Use helper to look up the user in their specific organization
    const userDoc = await getUsersRef(organizationId).doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({message: "User profile not found in database for this organization."});
    }

    const userData = userDoc.data();
    const userRole = userData.role || "Standard";
    const effectivePermissions = {};

    if (userRole === "Master Admin") {
      ALL_PERMISSIONS_KEYS.forEach((key) => effectivePermissions[key] = true);
    } else {
      // Use helper to get settings from the correct organization
      const permissionsDoc = await getSettingsRef(organizationId).doc("permissions").get();
      const allRolePermissions = permissionsDoc.exists ? permissionsDoc.data() : {};
      const roleDefaults = allRolePermissions[userRole] || [];

      ALL_PERMISSIONS_KEYS.forEach((key) => effectivePermissions[key] = false);
      roleDefaults.forEach((perm) => effectivePermissions[perm] = true);
      if (userData.permissionOverrides) {
        Object.assign(effectivePermissions, userData.permissionOverrides);
      }
    }

    const profileData = {
      displayName: userData.displayName || name,
      email: email,
      role: userRole,
      department: userData.department || "N/A",
      permissions: effectivePermissions,
    };

    return res.status(200).json(profileData);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return res.status(500).json({message: "Could not retrieve user profile."});
  }
};
