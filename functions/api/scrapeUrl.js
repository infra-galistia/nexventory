const admin = require("firebase-admin");

// Mock scraping function remains the same
const scrapeUrl = (url) => {
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

  // Require organizationId for API consistency, even if not used in the core logic
  const {url, organizationId} = req.body;

  if (!url || !organizationId) {
    return res.status(400).json({success: false, message: "Missing URL or organizationId."});
  }

  try {
    // Verify token to ensure the user is logged in
    await admin.auth().verifyIdToken(req.headers.authorization.split("Bearer ")[1]);

    const scrapedData = scrapeUrl(url);
    res.status(200).json({success: true, data: scrapedData});
  } catch (error) {
    console.error("Error scraping URL:", error);
    res.status(500).json({success: false, message: `Server Error: ${error.message}`});
  }
};
