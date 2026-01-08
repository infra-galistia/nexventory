const admin = require("firebase-admin");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

module.exports = async (req, res) => {
  // --- NEW: Authentication and Organization ID check ---
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized"});
  }
  const {category, comment, userEmail, pageUrl, organizationId} = req.body;

  if (!category || !comment || !organizationId) {
    return res.status(400).json({success: false, message: "Missing required feedback data or organizationId."});
  }

  try {
    // Verify the token to ensure the user is logged in
    await admin.auth().verifyIdToken(req.headers.authorization.split("Bearer ")[1]);

    // --- UPDATED: Store feedback in a subcollection of the organization ---
    await db.collection("organizations").doc(organizationId).collection("feedback").add({
      category,
      comment,
      userEmail: userEmail || "Anonymous",
      pageUrl: pageUrl || "Unknown",
      timestamp: FieldValue.serverTimestamp(),
      status: "New",
    });

    res.status(200).json({success: true, message: "Feedback submitted successfully."});
  } catch (error) {
    console.error("Failed to submit feedback:", error);
    res.status(500).json({success: false, message: "An error occurred while submitting feedback."});
  }
};
