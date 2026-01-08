const admin = require("firebase-admin");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getInventoryRef, getTransactionsRef} = require("../utils/dbHelpers");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

const getBarcodePrefixLogic = (itemName) => {
  if (!itemName || typeof itemName !== "string" || itemName.trim() === "") return "ERR";
  const words = itemName.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "INV";
  if (words.length === 1) return words[0].substring(0, 3);
  if (words.length === 2) return words[0].substring(0, 2) + words[1].charAt(0);
  return words[0].charAt(0) + words[1].charAt(0) + words[2].charAt(0);
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
    await admin.auth().verifyIdToken(req.headers.authorization.split("Bearer ")[1]);
    const inventoryRef = getInventoryRef(organizationId);

    if (action === "addItem") {
      const {imageData, ...itemData} = payload;
      const docRef = inventoryRef.doc();

      if (imageData && imageData.base64) {
        itemData.imageUrl = `data:${imageData.type};base64,${imageData.base64}`;
      }

      const prefix = getBarcodePrefixLogic(itemData.itemName);
      const newBarcode = `${prefix}-${String(Date.now()).slice(-4)}-${Math.random().toString(36).substr(2, 3).toUpperCase()}`;

      await docRef.set({
        ...itemData,
        Barcode: newBarcode,
        lastTransactionDate: FieldValue.serverTimestamp(),
        lastTransactionType: "New Item Added",
      });
      return res.status(200).json({success: true, message: `Item ${payload.itemName} added successfully.`});
    }

    if (action === "updateItem") {
      const {barcode, imageData, ...itemData} = payload;
      if (!barcode) return res.status(400).json({success: false, message: "Item barcode is required for updates."});

      const docRef = inventoryRef.doc(barcode);
      const responsePayload = {success: true, message: `Item ${itemData.itemName || barcode} updated successfully.`};

      if (imageData && imageData.base64) {
        const dataUri = `data:${imageData.type};base64,${imageData.base64}`;
        itemData.imageUrl = dataUri;
        responsePayload.newImageUrl = dataUri;
      }

      await docRef.update({
        ...itemData,
        lastTransactionDate: FieldValue.serverTimestamp(),
        lastTransactionType: "Item Details Updated",
      });

      return res.status(200).json(responsePayload);
    }

    if (action === "bulkImport") {
      const {items, barcodePreference} = payload;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({success: false, message: "No items for bulk import."});

      const batch = db.batch();
      let importedCount = 0;
      for (const item of items) {
        if (item["Item Name"] && item["Total Stock"]) {
          let docRef;
          let barcodeValue = "";
          if (barcodePreference === "csv" && item.Barcode) {
            barcodeValue = item.Barcode;
            docRef = inventoryRef.doc(barcodeValue);
          } else {
            const prefix = getBarcodePrefixLogic(item["Item Name"]);
            barcodeValue = `${prefix}-${String(Date.now()).slice(-4)}-${Math.random().toString(36).substr(2, 3).toUpperCase()}`;
            docRef = inventoryRef.doc(barcodeValue);
          }
          const totalStock = parseInt(item["Total Stock"], 10) || 0;
          batch.set(docRef, {
            itemName: item["Item Name"], sku: item["SKU"] || "", category: item["Category"] || "",
            totalStock, currentStock: totalStock,
            currentDepartment: item["Current Department"] || "", storageRoom: item["Storage Room"] || "",
            location: item["Location"] || "", loanStatus: "IN",
            lastTransactionDate: FieldValue.serverTimestamp(), lastTransactionType: "Bulk Import", Barcode: barcodeValue,
          });
          importedCount++;
        }
      }
      await batch.commit();
      return res.status(200).json({success: true, message: `Successfully imported ${importedCount} items.`});
    }

    if (action === "generateMissingBarcodes") {
      const snapshot = await inventoryRef.where("Barcode", "==", "").get();
      if (snapshot.empty) return res.status(200).json({success: true, message: "No items found missing a barcode."});

      const allDocsSnapshot = await inventoryRef.get();
      const allBarcodes = new Set(allDocsSnapshot.docs.map((doc) => doc.data().Barcode).filter(Boolean));
      const batch = db.batch();
      let generatedCount = 0;
      const prefixCounts = {};
      snapshot.docs.forEach((doc) => {
        const prefix = getBarcodePrefixLogic(doc.data().itemName);
        let maxNum = 0;
        allBarcodes.forEach((b) => {
          if (b.startsWith(prefix + "-")) {
            const num = parseInt(b.split("-")[1], 10);
            if (num > maxNum) maxNum = num;
          }
        });
        const nextNum = (prefixCounts[prefix] || maxNum) + 1;
        prefixCounts[prefix] = nextNum;
        const newBarcode = `${prefix}-${String(nextNum).padStart(3, "0")}`;
        batch.update(doc.ref, {Barcode: newBarcode});
        allBarcodes.add(newBarcode);
        generatedCount++;
      });
      await batch.commit();
      return res.status(200).json({success: true, message: `Generated ${generatedCount} new barcodes successfully.`});
    }

    if (action === "scanInvalidLocations") {
      const inventorySnapshot = await inventoryRef.get();
      const itemsForReview = [];
      inventorySnapshot.forEach((doc) => {
        const item = doc.data();
        const location = item.location || "";
        if (location && location.indexOf(" - ") === -1) {
          itemsForReview.push({id: doc.id, itemName: item.itemName, location: item.location});
        }
      });
      return res.status(200).json({success: true, items: itemsForReview});
    }

    if (action === "batchUpdateLocations") {
      const {updates} = payload;
      if (!updates || !Array.isArray(updates)) return res.status(400).json({success: false, message: "Invalid payload."});

      const batch = db.batch();
      updates.forEach((update) => {
        const docRef = inventoryRef.doc(update.id);
        batch.update(docRef, {location: update.newLocation});
      });
      await batch.commit();
      return res.status(200).json({success: true, message: `${updates.length} location(s) updated.`});
    }

    if (action === "masterReset") {
      const {resetLostDamaged} = payload;
      const allItemsSnapshot = await inventoryRef.get();
      const batch = db.batch();
      allItemsSnapshot.forEach((doc) => {
        const itemData = doc.data();
        const updates = {loanStatus: "IN", assignedTo: "", currentStock: itemData.totalStock};
        if (resetLostDamaged && itemData.damagedStock > 0) {
          const damagedCount = parseInt(itemData.damagedStock, 10) || 0;
          updates.totalStock = (parseInt(itemData.totalStock, 10) || 0) + damagedCount;
          updates.currentStock = updates.totalStock;
          updates.damagedStock = 0;
        }
        batch.update(doc.ref, updates);
      });

      const transactionLogRef = getTransactionsRef(organizationId);
      const logSnapshot = await transactionLogRef.get();
      logSnapshot.forEach((doc) => batch.delete(doc.ref));

      await batch.commit();
      return res.status(200).json({success: true, message: "Master Reset completed successfully."});
    }

    return res.status(400).json({success: false, message: "Invalid action."});
  } catch (error) {
    console.error(`Error during inventory action '${action}':`, error);
    return res.status(500).json({success: false, message: `Server Error: ${error.message}`});
  }
};
