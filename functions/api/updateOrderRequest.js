const admin = require("firebase-admin");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getOrderRequestsRef, getUsersRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

const scrapeUrl = (url) => {
  // Mock scraping logic remains the same
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes("amazon")) return {itemName: "AmazonBasics High-Speed HDMI Cable", price: 7.99, imageUrl: "https://placehold.co/400x400/000000/FFFFFF?text=Amazon+Item"};
  if (lowerUrl.includes("homedepot")) return {itemName: "Diablo 7-1/4 in. x 24-Tooth Framing Saw Blade", price: 11.97, imageUrl: "https://placehold.co/400x400/f96302/FFFFFF?text=Home+Depot"};
  if (lowerUrl.includes("walmart")) return {itemName: "Hyper Tough 20V Max Cordless Drill", price: 22.88, imageUrl: "https://placehold.co/400x400/0071ce/FFFFFF?text=Walmart"};
  return {itemName: "Generic Item from URL", price: 19.99, imageUrl: "https://placehold.co/400x400/cccccc/FFFFFF?text=Product"};
};

module.exports = async (req, res) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
    return res.status(403).json({success: false, message: "Unauthorized"});
  }
  const {action, payload, organizationId} = req.body;
  if (!action || !payload || !organizationId) {
    return res.status(400).json({success: false, message: "Missing action, payload, or organizationId."});
  }

  try {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDoc = await getUsersRef(organizationId).doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({success: false, message: "User not found."});
    const userEmail = userDoc.data().email;

    const orderRequestsRef = getOrderRequestsRef(organizationId);

    if (action === "submitRequest") {
      const {url, quantity, dateNeeded, notes} = payload;
      if (!url || !quantity || !dateNeeded) return res.status(400).json({success: false, message: "URL, quantity, and date are required."});

      const scrapedData = scrapeUrl(url);
      const newRequestRef = orderRequestsRef.doc();
      await newRequestRef.set({
        id: newRequestRef.id, requestedBy: userEmail,
        requestDate: FieldValue.serverTimestamp(), status: "Pending",
        url, quantity: parseInt(quantity, 10), dateNeeded, notes: notes || "",
        itemName: scrapedData.itemName, imageUrl: scrapedData.imageUrl,
      });
      return res.status(200).json({success: true, message: "Order request submitted."});
    }

    if (action === "approveRequest" || action === "denyRequest") {
      const {requestId} = payload;
      if (!requestId) return res.status(400).json({success: false, message: "Request ID is missing."});

      const requestRef = orderRequestsRef.doc(requestId);
      const newStatus = action === "approveRequest" ? "Approved" : "Denied";

      await requestRef.update({
        status: newStatus,
        processedBy: userEmail,
        processedDate: FieldValue.serverTimestamp(),
      });
      return res.status(200).json({success: true, message: `Request has been ${newStatus.toLowerCase()}.`});
    }

    return res.status(400).json({success: false, message: "Invalid action."});
  } catch (error) {
    console.error(`Error during order request action '${action}':`, error);
    return res.status(500).json({success: false, message: `Server Error: ${error.message}`});
  }
};
