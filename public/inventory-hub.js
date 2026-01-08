// public/inventory-hub.js

// --- 1. PAGE-SPECIFIC STATE ---
let activeView = 'OrderRequests';
let hubDataCache = {};
let selectedOrderRequest = null;
const IS_ADMIN = false; 
let adminRequestView = 'pending'; 
let currentEditingKit = null;
let activeComponentBarcode = null;



// --- 2. INITIALIZATION ---
function onAuthReady(user) {
    if (user) {
        fetchInventoryHubData();
    } else {
        const hubLoader = document.getElementById('hub-loader');
        if(hubLoader) hubLoader.innerHTML = `<h2>Please Sign In</h2><p>The Inventory Hub requires authentication.</p>`;
        hideAppPreloader();
    }
}


async function fetchInventoryHubData() {
    const hubLoader = document.getElementById('hub-loader');
    const hubContainer = document.getElementById('hub-container');
    try {
        hubLoader.style.display = 'flex';
        hubContainer.style.display = 'none';

        const response = await apiFetch('/api/getInventoryHubData', {
            method: 'POST',
            body: JSON.stringify({})
        });
        if (!response.ok) throw new Error(`Server Error: ${response.status}`);
        
        const data = await response.json();
        hubDataCache = data;
        window.pageDataCache = data; // Make it globally accessible for helpers

        hubLoader.style.display = 'none';
        hubContainer.style.display = 'block';
        
        renderSidebar(); // This now handles permissions
        renderContent();

    } catch (error) {
        console.error("Failed to fetch Inventory Hub data:", error);
        hubLoader.innerHTML = `<div class="message-box error">Failed to load hub data.</div>`;
    } finally {
        hideAppPreloader();
    }
}

// --- 3. UI RENDERING & CORE LOGIC ---

function renderSidebar() {
    const sidebarLinksContainer = document.getElementById('hub-sidebar-links');
    if (!sidebarLinksContainer) return;

    const userPermissions = hubDataCache.userPermissions || {};
    
    const allPossibleViews = [
        { id: 'OrderRequests', icon: 'fa-shopping-cart', text: 'Order Requests', permission: null },
        { id: 'InventoryManagement', icon: 'fa-box-open', text: 'Inventory Management', permission: 'canManageInventory' },
        { id: 'ProjectKitBuilder', icon: 'fa-sitemap', text: 'Project Kit Builder', permission: 'canBuildKits' },
        { id: 'AssetLabels', icon: 'fa-tags', text: 'Asset Labels', permission: 'canGenerateLabels' },
        { id: 'LocationManager', icon: 'fa-map-signs', text: 'Location Manager', permission: 'canManageLocations' }
    ];

    // THIS IS THE FIX: Filter views based on user permissions
    const accessibleViews = allPossibleViews.filter(view => 
        !view.permission || userPermissions[view.permission]
    );

    // If the currently active view is no longer accessible, default to the first available one
    if (!accessibleViews.some(v => v.id === activeView)) {
        activeView = accessibleViews.length > 0 ? accessibleViews[0].id : 'OrderRequests';
    }

    sidebarLinksContainer.innerHTML = accessibleViews.map(v => `
        <li><a href="#" class="nav-link ${v.id === activeView ? 'active' : ''}" data-view="${v.id}">
            <i class="fas ${v.icon} fa-fw"></i> <span class="link-text">${v.text}</span>
        </a></li>`).join('');

    // Attach event listener to the sidebar to handle clicks
    sidebarLinksContainer.addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link');
        if (link && link.dataset.view) {
            e.preventDefault();
            activeView = link.dataset.view;
            renderContent(); // Re-render content when a link is clicked
        }
    });
}

function renderContent() {
    const contentPanel = document.getElementById('content-panel');
    if (!contentPanel) return;

    // Highlight the active link in the sidebar
    document.querySelectorAll('#hub-sidebar-links .nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.view === activeView);
    });
    
    // Update page title
    const pageTitle = document.getElementById('hub-page-title');
    const activeLinkText = document.querySelector(`#hub-sidebar-links .nav-link[data-view="${activeView}"] .link-text`)?.textContent;
    if (pageTitle && activeLinkText) pageTitle.textContent = activeLinkText;

    let html = '';
    switch (activeView) {
        case 'OrderRequests': html = renderOrderRequestsView(); break;
        case 'InventoryManagement': html = renderInventoryManagementView(); break;
        case 'ProjectKitBuilder': html = renderProjectKitBuilderView(); break;
        case 'AssetLabels': html = renderAssetLabelsView(); break;
        case 'LocationManager': html = renderLocationManagerView(); break;
        default: html = `<h3>Select an area from the sidebar</h3>`;
    }
    contentPanel.innerHTML = html;

    // Attach the correct event listeners for the rendered content
    if (activeView === 'OrderRequests') attachOrderRequestListeners();
    else if (activeView === 'InventoryManagement') attachInventoryManagementListeners();
    else if (activeView === 'ProjectKitBuilder') attachProjectKitBuilderListeners();
    else if (activeView === 'AssetLabels') attachAssetLabelsListeners();
    else if (activeView === 'LocationManager') attachLocationManagerListeners();
}


function attachProjectKitBuilderListeners() {
    renderKitList(); 
    setupItemSelector('kitComponent', addComponentToKit, () => hubDataCache.allItems);
    
    const listAllComponents = () => {
        const itemsAlreadyInKit = Array.from(document.querySelectorAll('#componentList .component-item')).map(li => li.dataset.barcode);
        const availableItems = hubDataCache.allItems.filter(item => !itemsAlreadyInKit.includes(item.id));
        handleListAllClick(availableItems, addComponentToKit);
    };

    document.getElementById('newKitBtn')?.addEventListener('click', () => displayKitForEditing(null));
    document.getElementById('saveKitBtn')?.addEventListener('click', handleSaveKit);
    document.getElementById('deleteKitBtn')?.addEventListener('click', handleDeleteKit);
    document.getElementById('kitSearchInput')?.addEventListener('input', renderKitList);
    document.getElementById('kitComponentListAllBtn')?.addEventListener('click', listAllComponents);
}

// --- 4. ORDER REQUESTS FEATURE ---

function renderOrderRequestsView() {
    if (IS_ADMIN) {
        return renderAdminOrderDashboard();
    } else {
        return renderUserOrderRequestForm();
    }
}

function attachOrderRequestListeners() {
    if (IS_ADMIN) {
        document.querySelectorAll('.admin-request-tabs .tab-button').forEach(btn => {
            btn.addEventListener('click', () => {
                adminRequestView = btn.dataset.tab;
                selectedOrderRequest = null; 
                renderContent(); 
            });
        });
        renderAdminRequestList();
    } else {
        document.getElementById('submitOrderRequestBtn')?.addEventListener('click', handleNewOrderRequest);
        renderUserRequestsList();
    }
}

function renderUserOrderRequestForm() {
    return `
        <h3>Request Inventory Order</h3>
        <p>Need something that isn't in stock? Fill out the form below to request an order.</p>
        <div class="order-request-grid">
            <div class="tool-card">
                <h4>New Request</h4>
                <div class="form-group">
                    <label for="productUrl">Product URL</label>
                    <input type="url" id="productUrl" class="form-control" placeholder="https://www.amazon.com/dp/B01H7M8422" required>
                </div>
                <div class="form-group">
                    <label for="quantityNeeded">Quantity</label>
                    <input type="number" id="quantityNeeded" class="form-control" min="1" value="1" required>
                </div>
                <div class="form-group">
                    <label for="dateNeeded">Date Required By</label>
                    <input type="date" id="dateNeeded" class="form-control" required>
                </div>
                 <div class="form-group">
                    <label for="orderNotes">Notes (Optional)</label>
                    <textarea id="orderNotes" class="form-control" placeholder="e.g., For Capstone Project XYZ"></textarea>
                </div>
                <button id="submitOrderRequestBtn" class="btn btn-success"><i class="fas fa-paper-plane"></i> Submit Request</button>
            </div>
            <div class="tool-card">
                <h4>My Past Requests</h4>
                <div id="user-requests-list-container" class="request-list-container"></div>
            </div>
        </div>
        <div id="order-request-message-box" class="message-box" style="margin-top: 1.5rem;"></div>
    `;
}

function renderUserRequestsList() {
    const container = document.getElementById('user-requests-list-container');
    const myRequests = hubDataCache.orderRequests?.filter(r => r.requestedBy === "test.user@example.com") || [];

    if (myRequests.length === 0) {
        container.innerHTML = `<p>You have not made any requests yet.</p>`;
        return;
    }

    container.innerHTML = `<ul class="request-list">${myRequests.map(r => `
        <li class="request-item">
            <div class="request-item-header">
                <span style="font-weight: bold;">${r.itemName || new URL(r.url).hostname}</span>
                <span class="status-badge ${r.status.toLowerCase()}">${r.status}</span>
            </div>
            <div class="request-item-details">
                Qty: ${r.quantity} | Needed by: ${new Date(r.dateNeeded).toLocaleDateString()}
            </div>
        </li>
    `).join('')}</ul>`;
}

async function handleNewOrderRequest() {
    const url = document.getElementById('productUrl').value;
    const quantity = document.getElementById('quantityNeeded').value;
    const dateNeeded = document.getElementById('dateNeeded').value;
    const notes = document.getElementById('orderNotes').value;

    if (!url || !quantity || !dateNeeded) {
        return displayMessage('Please fill out all required fields.', 'error', 'order-request-message-box');
    }

    const btn = document.getElementById('submitOrderRequestBtn');
    showSpinner(btn);

    try {
        const response = await apiFetch('/api/updateOrderRequest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'submitRequest', payload: { url, quantity, dateNeeded, notes } })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        displayMessage(result.message, 'success', 'order-request-message-box');
        document.getElementById('productUrl').value = '';
        document.getElementById('quantityNeeded').value = '1';
        document.getElementById('dateNeeded').value = '';
        document.getElementById('orderNotes').value = '';
        
        fetchInventoryHubData().then(() => renderUserRequestsList());

    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'order-request-message-box');
    } finally {
        hideSpinner(btn);
    }
}

function renderAdminOrderDashboard() {
    return `
        <h3>Inventory Order Requests</h3>
        <p>Review, scrape, and approve or deny new inventory order requests from users.</p>
        
        <div class="admin-request-tabs">
            <button class="tab-button ${adminRequestView === 'pending' ? 'active' : ''}" data-tab="pending">Pending</button>
            <button class="tab-button ${adminRequestView === 'history' ? 'active' : ''}" data-tab="history">History</button>
        </div>

        <div class="order-request-grid">
            <div class="tool-card">
                <h4 id="admin-request-list-title"></h4>
                <div id="admin-requests-list-container" class="request-list-container"></div>
            </div>
            <div id="admin-request-viewer" class="tool-card">
                <div class="mappings-placeholder">Select a request to view its details.</div>
            </div>
        </div>
        <div id="order-request-admin-message-box" class="message-box" style="margin-top: 1.5rem;"></div>
    `;
}

function renderAdminRequestList() {
    const container = document.getElementById('admin-requests-list-container');
    const title = document.getElementById('admin-request-list-title');
    
    let requestsToShow;
    if (adminRequestView === 'pending') {
        title.textContent = 'Pending Requests';
        requestsToShow = hubDataCache.orderRequests?.filter(r => r.status === 'Pending') || [];
    } else { // history
        title.textContent = 'Processed Requests';
        requestsToShow = hubDataCache.orderRequests?.filter(r => r.status !== 'Pending') || [];
    }

    if (requestsToShow.length === 0) {
        container.innerHTML = `<p>There are no ${adminRequestView} requests.</p>`;
        return;
    }

    container.innerHTML = `<ul class="request-list">${requestsToShow.map(r => `
        <li class="request-item ${selectedOrderRequest?.id === r.id ? 'active' : ''}" data-request-id="${r.id}">
            <div class="request-item-header">
                <span>${r.requestedBy}</span>
                <span class="status-badge ${r.status.toLowerCase()}">${r.status}</span>
            </div>
            <div class="request-item-details">
                Item: ${r.itemName || 'N/A'} | Qty: ${r.quantity}
            </div>
        </li>
    `).join('')}</ul>`;
    
    container.querySelectorAll('.request-item').forEach(item => {
        item.addEventListener('click', () => {
            selectedOrderRequest = hubDataCache.orderRequests.find(r => r.id === item.dataset.requestId);
            renderAdminRequestList();
            renderAdminRequestDetails();
        });
    });
}

function renderAdminRequestDetails() {
    const container = document.getElementById('admin-request-viewer');
    if (!container || !selectedOrderRequest) {
        container.innerHTML = `<div class="mappings-placeholder">Select a request to view its details.</div>`;
        return;
    }

    const r = selectedOrderRequest;
    const isPending = r.status === 'Pending';
    
    const actionButtons = isPending ? `
        <div style="margin-top: 2rem; display: flex; gap: 15px; border-top: 1px solid var(--border-color); padding-top: 1.5rem;">
            <button id="approveRequestBtn" class="btn btn-success"><i class="fas fa-check"></i> Approve</button>
            <button id="denyRequestBtn" class="btn btn-danger"><i class="fas fa-times"></i> Deny</button>
        </div>
    ` : `
        <div class="message-box info" style="display:block; margin-top: 1.5rem;">
            This request was ${r.status.toLowerCase()} by ${r.processedBy || 'N/A'} on ${new Date(r.processedDate).toLocaleDateString()}.
        </div>
    `;

    container.innerHTML = `
        <h4>Request Details</h4>
        <ul class="detail-list">
            <li><span class="label">Item Name:</span><span class="value">${r.itemName || 'N/A'}</span></li>
            <li><span class="label">Requested By:</span><span class="value">${r.requestedBy}</span></li>
            <li><span class="label">Request Date:</span><span class="value">${new Date(r.requestDate).toLocaleString()}</span></li>
            <li><span class="label">Date Needed:</span><span class="value">${new Date(r.dateNeeded).toLocaleDateString()}</span></li>
            <li><span class="label">Quantity:</span><span class="value">${r.quantity}</span></li>
            <li><span class="label">Product URL:</span><span class="value"><a href="${r.url}" target="_blank">View Product Page</a></span></li>
            <li><span class="label">Notes:</span><span class="value">${r.notes || 'N/A'}</span></li>
        </ul>
        <button id="scrapeUrlBtn" class="btn" style="margin-top: 1.5rem;" ${!isPending ? 'disabled' : ''}><i class="fas fa-magic"></i> Scrape URL for Details</button>
        <div id="scraped-data-container"></div>
        ${actionButtons}
    `;

    if (isPending) {
        document.getElementById('scrapeUrlBtn')?.addEventListener('click', () => handleScrapeUrl(r.url));
        document.getElementById('approveRequestBtn')?.addEventListener('click', () => handleUpdateRequestStatus('approveRequest', r.id));
        document.getElementById('denyRequestBtn')?.addEventListener('click', () => handleUpdateRequestStatus('denyRequest', r.id));
    }
}

async function handleScrapeUrl(url) {
    const btn = document.getElementById('scrapeUrlBtn');
    const container = document.getElementById('scraped-data-container');
    showSpinner(btn);

    try {
        const response = await apiFetch('/api/scrapeUrl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        const { itemName, price, imageUrl } = result.data;
        container.innerHTML = `
            <div class="scraped-data-card">
                <img src="${imageUrl}" alt="Scraped product image">
                <div class="info">
                    <h5>${itemName}</h5>
                    <p>$${price.toFixed(2)}</p>
                </div>
            </div>
        `;

    } catch (error) {
        container.innerHTML = `<p class="message-box error" style="display:block;">Could not scrape URL.</p>`;
    } finally {
        hideSpinner(btn);
    }
}

async function handleUpdateRequestStatus(action, requestId) {
    const btnId = action === 'approveRequest' ? 'approveRequestBtn' : 'denyRequestBtn';
    const btn = document.getElementById(btnId);
    showSpinner(btn);

    try {
        const response = await apiFetch('/api/updateOrderRequest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload: { requestId } })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        displayMessage(result.message, 'success', 'order-request-admin-message-box');
        
        selectedOrderRequest = null;
        fetchInventoryHubData().then(() => {
            renderAdminRequestList();
            renderAdminRequestDetails();
        });

    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'order-request-admin-message-box');
    } finally {
        hideSpinner(btn);
    }
}


// ==========================================================
// --- 5. INVENTORY MANAGEMENT FEATURE ---
// ==========================================================

let activeInventoryTab = 'imageManagement';
let selectedItemForEdit = null;
let newItemImageData = null;
let editItemImageData = null;

function renderInventoryManagementView() {
    return `
        <h3>Inventory Management</h3>
        <p>Add, edit, import, and manage images for all items in the master inventory.</p>
        <div class="tab-navigation" id="inventory-mgmt-tabs">
            <button class="tab-button ${activeInventoryTab === 'imageManagement' ? 'active' : ''}" data-tab="imageManagement"><i class="fas fa-image"></i> Image Management</button>
            <button class="tab-button ${activeInventoryTab === 'addNewItem' ? 'active' : ''}" data-tab="addNewItem"><i class="fas fa-plus-circle"></i> Add New Item</button>
            <button class="tab-button ${activeInventoryTab === 'editItem' ? 'active' : ''}" data-tab="editItem"><i class="fas fa-edit"></i> Edit Item Details</button>
            <button class="tab-button ${activeInventoryTab === 'bulkImport' ? 'active' : ''}" data-tab="bulkImport"><i class="fas fa-file-csv"></i> Bulk Import</button>
        </div>
        <div id="inventory-mgmt-content"></div>
    `;
}

function attachInventoryManagementListeners() {
    document.querySelectorAll('#inventory-mgmt-tabs .tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            activeInventoryTab = btn.dataset.tab;
            renderContent();
        });
    });
    renderInventoryManagementContent();
}

function renderInventoryManagementContent() {
    const container = document.getElementById('inventory-mgmt-content');
    if (!container) return;
    selectedItemForEdit = null;
    newItemImageData = null;
    editItemImageData = null;
    switch (activeInventoryTab) {
        case 'imageManagement':
            container.innerHTML = renderImageManagementTab();
            setupItemSelector('imgMgmt', handleItemSelectedForImage, () => hubDataCache.allItems);
            document.getElementById('imgMgmtScanBtn')?.addEventListener('click', () => handleScanClick(handleItemSelectedForImage));
            document.getElementById('imgMgmtListItemBtn')?.addEventListener('click', () => handleListAllClick(hubDataCache.allItems, handleItemSelectedForImage));
            break;
        case 'addNewItem':
            container.innerHTML = renderItemForm();
            document.getElementById('item-form-submit-btn').addEventListener('click', handleAddNewItem);
            document.getElementById('item-form-image-upload').addEventListener('change', handleNewItemImageSelected);
            document.getElementById('item-form-image-capture').addEventListener('change', handleNewItemImageSelected);
            break;
        case 'editItem':
            container.innerHTML = renderEditItemTab();
            setupItemSelector('editItem', handleItemSelectedForEdit, () => hubDataCache.allItems);
            document.getElementById('editItemScanBtn')?.addEventListener('click', () => handleScanClick(handleItemSelectedForEdit));
            document.getElementById('editItemListItemBtn')?.addEventListener('click', () => handleListAllClick(hubDataCache.allItems, handleItemSelectedForEdit));
            break;
        case 'bulkImport':
            container.innerHTML = renderBulkImportTab();
            document.getElementById('importCsvBtn').addEventListener('click', handleBulkImport);
            document.getElementById('generateMissingBarcodesBtn')?.addEventListener('click', handleGenerateMissingBarcodes);
            break;
    }
}

function renderImageManagementTab() {
    return `
        <div class="tool-card">
            <h4>1. Select Item to Edit</h4>
            <div class="item-selector-group">
                <div class="form-group" style="flex-grow:1; margin-bottom:0; position:relative;">
                    <input type="text" id="imgMgmtSearchInput" class="form-control" autocomplete="off" placeholder="Search, Scan, or List All Items...">
                    <div class="autocomplete-list" id="imgMgmtAutocompleteList"></div>
                </div>
                <button type="button" class="btn" id="imgMgmtScanBtn"><i class="fas fa-qrcode"></i> Scan</button>
                <button type="button" class="btn" id="imgMgmtListItemBtn"><i class="fas fa-list"></i> List All</button>
            </div>
        </div>
        <div id="image-editor-container" class="tool-card hidden" style="margin-top: 1.5rem;"></div>
    `;
}

function renderEditItemTab() {
     return `
        <div class="tool-card">
            <h4>1. Select Item to Edit</h4>
            <div class="item-selector-group">
                <div class="form-group" style="flex-grow:1; margin-bottom:0; position:relative;">
                    <input type="text" id="editItemSearchInput" class="form-control" autocomplete="off" placeholder="Search, Scan, or List All Items...">
                    <div class="autocomplete-list" id="editItemAutocompleteList"></div>
                </div>
                <button type="button" class="btn" id="editItemScanBtn"><i class="fas fa-qrcode"></i> Scan</button>
                <button type="button" class="btn" id="editItemListItemBtn"><i class="fas fa-list"></i> List All</button>
            </div>
        </div>
        <div id="item-editor-container" class="hidden" style="margin-top: 1.5rem;"></div>
    `;
}

function renderBulkImportTab() {
    return `
        <div class="tool-card">
            <h4>Bulk Import from CSV</h4>
            <p>Quickly add multiple new items by uploading a CSV file. The file must contain the headers: <strong>Item Name, Total Stock</strong>. Optional headers: <strong>SKU, Barcode, Category, Current Department, Storage Room, Location</strong>.</p>
            
            <div class="import-options">
                <h5>Barcode/SKU Options</h5>
                <div class="radio-group">
                    <label class="radio-label"><input type="radio" name="barcodePreference" value="auto" checked> Auto-generate new barcodes for all items</label>
                    <label class="radio-label"><input type="radio" name="barcodePreference" value="csv"> Use "Barcode" and "SKU" columns from CSV file (if they exist)</label>
                </div>
            </div>

            <div class="form-group" style="margin-top: 20px;">
                <label for="csvFileInput">Select CSV File</label>
                <input type="file" id="csvFileInput" class="form-control" accept=".csv">
            </div>
            <button id="importCsvBtn" type="button" class="btn"><i class="fas fa-upload"></i> Import CSV</button>
            <div id="import-message-box" class="message-box" style="margin-top: 1rem;"></div>
        </div>

        <div class="tool-card" style="margin-top: 1.5rem;">
            <h4>Barcode Generation</h4>
            <p>Scan the entire inventory and create unique barcodes for any items that are missing one. This is useful after an import where barcodes were not provided.</p>
            <button id="generateMissingBarcodesBtn" class="btn"><i class="fas fa-barcode"></i> Generate Missing Barcodes</button>
        </div>
    `;
}

function renderItemForm(item = null) {
    const isEditing = item !== null;
    const departmentOptions = (hubDataCache.dropdowns?.Departments || [])
        .map(d => `<option value="${d}" ${item && item.currentDepartment === d ? 'selected' : ''}>${d}</option>`).join('');

    const barcodeField = isEditing ? `
        <div class="form-group full-width">
            <label>Barcode (read-only)</label>
            <input type="text" class="form-control" value="${item?.Barcode || item?.id || 'N/A'}" readonly>
        </div>
    ` : '';

    return `
        <div class="tool-card">
            <h4>${isEditing ? `Editing: ${item.itemName}` : 'Add New Item'}</h4>
            <div class="inventory-form-grid">
                <div class="form-group"><label>Item Name</label><input id="itemName" type="text" class="form-control" value="${item?.itemName || ''}"></div>
                <div class="form-group"><label>SKU (Stock Keeping Unit)</label><input id="itemSku" type="text" class="form-control" value="${item?.sku || ''}" placeholder="e.g., WIRE-BLK-14G"></div>
                <div class="form-group"><label>Category</label><input id="itemCategory" type="text" class="form-control" value="${item?.category || ''}"></div>
                <div class="form-group"><label>Total Stock</label><input id="itemTotalStock" type="number" min="0" class="form-control" value="${item?.totalStock || 1}"></div>
                <div class="form-group"><label>Department</label><select id="itemDepartment" class="form-control">${departmentOptions}</select></div>
                <div class="form-group"><label>Storage Room</label><input id="itemStorageRoom" type="text" class="form-control" value="${item?.storageRoom || ''}"></div>
                <div class="form-group"><label>Location</label><input id="itemLocation" type="text" class="form-control" value="${item?.location || ''}"></div>
                <div class="form-group full-width"><label>Description</label><textarea id="itemDescription" class="form-control">${item?.itemDescription || ''}</textarea></div>
                ${barcodeField}
                <div class="form-group full-width">
                    <label>Item Image</label>
                    <div class="image-preview-container">
                        <p id="item-form-image-text">${isEditing && item.imageUrl ? 'Current Image:' : 'No Image Selected'}</p>
                        <img id="item-form-image-preview" src="${item?.imageUrl || ''}" class="${item?.imageUrl ? '' : 'hidden'}">
                    </div>
                    <div class="image-upload-buttons">
                        <label for="item-form-image-upload" class="btn"><i class="fas fa-upload"></i> Upload From Device</label>
                        <input type="file" id="item-form-image-upload" class="hidden" accept="image/*">
                        <label for="item-form-image-capture" class="btn"><i class="fas fa-camera"></i> Take Photo</label>
                        <input type="file" id="item-form-image-capture" class="hidden" accept="image/*" capture="environment">
                    </div>
                </div>
            </div>
            <div style="margin-top: 1.5rem;">
                <button id="item-form-submit-btn" class="btn btn-success"><i class="fas fa-save"></i> ${isEditing ? 'Save Changes' : 'Add Item'}</button>
            </div>
            <div id="item-form-message-box" class="message-box" style="margin-top: 1rem;"></div>
        </div>
    `;
}

function handleItemSelectedForImage(item) {
    selectedItemForEdit = item;
    const container = document.getElementById('image-editor-container');
    container.classList.remove('hidden');
    container.innerHTML = `
        <h4>2. Update Image for: ${item.itemName}</h4>
        <div class="image-preview-container">
            <p id="image-editor-text">${item.imageUrl ? 'Current Image:' : 'No Image'}</p>
            <img id="image-editor-preview" src="${item.imageUrl || 'https://placehold.co/400x400/eee/ccc?text=No+Image'}">
        </div>
        <div class="image-upload-buttons">
            <label for="image-editor-upload" class="btn"><i class="fas fa-upload"></i> Upload From Device</label>
            <input type="file" id="image-editor-upload" class="hidden" accept="image/*">
            <label for="image-editor-capture" class="btn"><i class="fas fa-camera"></i> Take Photo</label>
            <input type="file" id="image-editor-capture" class="hidden" accept="image/*" capture="environment">
        </div>
        <button id="save-image-btn" class="btn btn-success" style="margin-top: 1rem;" disabled><i class="fas fa-save"></i> Save New Image</button>
        <div id="image-editor-message-box" class="message-box" style="margin-top: 1rem;"></div>
    `;
    document.getElementById('image-editor-upload').addEventListener('change', handleEditItemImageSelected);
    document.getElementById('image-editor-capture').addEventListener('change', handleEditItemImageSelected);
    document.getElementById('save-image-btn').addEventListener('click', handleUpdateItem);
}

function handleItemSelectedForEdit(item) {
    selectedItemForEdit = item;
    const container = document.getElementById('item-editor-container');
    container.classList.remove('hidden');
    container.innerHTML = renderItemForm(item);
    document.getElementById('item-form-submit-btn').addEventListener('click', handleUpdateItem);
    document.getElementById('item-form-image-upload').addEventListener('change', handleEditItemImageSelected);
    document.getElementById('item-form-image-capture').addEventListener('change', handleEditItemImageSelected);
}

function compressImage(file, callback) {
    const MAX_WIDTH = 800;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function handleNewItemImageSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    compressImage(file, (compressedDataUri) => {
        newItemImageData = {
            base64: compressedDataUri.split(',')[1],
            type: 'image/jpeg'
        };
        document.getElementById('item-form-image-preview').src = compressedDataUri;
        document.getElementById('item-form-image-preview').classList.remove('hidden');
        document.getElementById('item-form-image-text').textContent = 'New Image Preview:';
    });
}

function handleEditItemImageSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    compressImage(file, (compressedDataUri) => {
        editItemImageData = {
            base64: compressedDataUri.split(',')[1],
            type: 'image/jpeg'
        };
        const previewId = activeInventoryTab === 'imageManagement' ? 'image-editor-preview' : 'item-form-image-preview';
        const textId = activeInventoryTab === 'imageManagement' ? 'image-editor-text' : 'item-form-image-text';
        document.getElementById(previewId).src = compressedDataUri;
        document.getElementById(textId).textContent = 'New Image Preview:';
        document.getElementById('save-image-btn')?.removeAttribute('disabled');
    });
}

async function handleAddNewItem() {
    const payload = {
        itemName: document.getElementById('itemName').value,
        sku: document.getElementById('itemSku').value,
        category: document.getElementById('itemCategory').value,
        totalStock: parseInt(document.getElementById('itemTotalStock').value, 10),
        currentStock: parseInt(document.getElementById('itemTotalStock').value, 10),
        currentDepartment: document.getElementById('itemDepartment').value,
        storageRoom: document.getElementById('itemStorageRoom').value,
        location: document.getElementById('itemLocation').value,
        itemDescription: document.getElementById('itemDescription').value,
        loanStatus: 'IN',
        imageData: newItemImageData,
        Barcode: ''
    };
    if (!payload.itemName || !payload.totalStock) {
        return displayMessage('Item Name and Total Stock are required.', 'error', 'item-form-message-box');
    }
    const btn = document.getElementById('item-form-submit-btn');
    showSpinner(btn);
    try {
        const response = await apiFetch('/api/updateInventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'addItem', payload })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        await fetchInventoryHubData();
        renderInventoryManagementContent();
        setTimeout(() => displayMessage(result.message, 'success', 'item-form-message-box'), 100);
    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'item-form-message-box');
    } finally {
        hideSpinner(btn);
    }
}

async function handleUpdateItem() {
    if (!selectedItemForEdit) return;

    const payload = {
        barcode: selectedItemForEdit.id,
        itemName: document.getElementById('itemName')?.value,
        sku: document.getElementById('itemSku')?.value,
        category: document.getElementById('itemCategory')?.value,
        totalStock: parseInt(document.getElementById('itemTotalStock')?.value, 10),
        currentDepartment: document.getElementById('itemDepartment')?.value,
        storageRoom: document.getElementById('itemStorageRoom')?.value,
        location: document.getElementById('itemLocation')?.value,
        itemDescription: document.getElementById('itemDescription')?.value,
        imageData: editItemImageData
    };
    
    const btn = document.getElementById('item-form-submit-btn') || document.getElementById('save-image-btn');
    const messageBoxId = activeInventoryTab === 'imageManagement' ? 'image-editor-message-box' : 'item-form-message-box';
    showSpinner(btn);

    try {
        const response = await apiFetch('/api/updateInventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'updateItem', payload })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        // Manually update the local cache with the new image URL from the server's response.
        if (result.newImageUrl) {
            const cachedItem = hubDataCache.allItems.find(i => i.id === selectedItemForEdit.id);
            if (cachedItem) {
                cachedItem.imageUrl = result.newImageUrl;
            }
        }
        
        // Re-render the view using the now-updated local cache.
        if (activeInventoryTab === 'imageManagement') {
             handleItemSelectedForImage(selectedItemForEdit);
        } else {
             handleItemSelectedForEdit(selectedItemForEdit);
        }

        // Display the success message in the correct message box.
        setTimeout(() => {
            displayMessage(result.message, 'success', messageBoxId);
        }, 100);

    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', messageBoxId);
    } finally {
        // The button is part of the re-rendered content, so we don't need to hide the spinner.
    }
}

function handleBulkImport() {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];
    if (!file) {
        return displayMessage('Please select a CSV file to import.', 'error', 'import-message-box');
    }
    const barcodePreference = document.querySelector('input[name="barcodePreference"]:checked').value;
    const reader = new FileReader();
    reader.onload = async (event) => {
        const csvText = event.target.result;
        const lines = csvText.split('\n').filter(line => line.trim() !== '');
        const headers = lines.shift().split(',').map(h => h.trim());
        const items = lines.map(line => {
            const values = line.split(',');
            let item = {};
            headers.forEach((header, index) => {
                item[header] = values[index]?.trim();
            });
            return item;
        });
        const btn = document.getElementById('importCsvBtn');
        showSpinner(btn);
        try {
                const response = await apiFetch('/api/updateInventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'bulkImport', payload: { items, barcodePreference } })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            await fetchInventoryHubData(); 
            displayMessage(result.message, 'success', 'import-message-box');
        } catch (error) {
            displayMessage(`Import Error: ${error.message}`, 'error', 'import-message-box');
        } finally {
            hideSpinner(btn);
            fileInput.value = '';
        }
    };
    reader.readAsText(file);
}

async function handleGenerateMissingBarcodes() {
    const btn = document.getElementById('generateMissingBarcodesBtn');
    showSpinner(btn);
    try {
        const response = await apiFetch('/api/updateInventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generateMissingBarcodes', payload: {} })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        await fetchInventoryHubData();
        displayMessage(result.message, 'success', 'import-message-box');
    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'import-message-box');
    } finally {
        hideSpinner(btn);
    }
}






// ==========================================================
// --- . PROJECT KIT BUILDER ---
// ==========================================================

// in public/inventory-hub.js

function renderProjectKitBuilderView() {
    return `
        <h3>Project Kit Builder</h3>
        <p>Create and manage multi-item kits. Kits act as a single check-outable item containing multiple components.</p>
        
                <div id="kit-builder-message-box" class="message-box" style="margin-top: 1rem;"></div>


        <div class="builder-container" style="margin-top: 1.5rem;">
            <div class="kit-list-panel">
                <button id="newKitBtn" class="btn" style="width: 100%; margin-bottom: 15px;"><i class="fas fa-plus"></i> New Project Kit</button>
                <input type="text" id="kitSearchInput" class="form-control" placeholder="Filter kits...">
                <ul id="kitList" class="kit-list"></ul>
            </div>
            <div id="editorPanel" class="tool-card hidden">
                <h4 id="editorTitle"></h4>
                <form id="kitEditorForm" onsubmit="return false;">
                    <div class="form-group"><label for="kitName">Kit Name</label><input type="text" id="kitName" required class="form-control"></div>
                    <div class="form-group"><label for="kitQuantity">Number of Complete Kits (Total Stock)</label><input type="number" id="kitQuantity" min="0" class="form-control" placeholder="e.g., 10"></div>
                    <div class="form-group"><label for="kitBarcode">Kit Barcode (Auto-generated)</label><input type="text" id="kitBarcode" readonly class="form-control"></div>
                    <hr style="margin: 20px 0;">
                    <h5>Components</h5>
                    <div class="form-group">
                        <label for="kitComponentSearchInput">Add Component from Inventory</label>
                        <div class="item-selector-group">
                            <div style="flex-grow:1; position:relative;">
                                <input type="text" id="kitComponentSearchInput" autocomplete="off" placeholder="Search for items to add..." class="form-control">
                                <div class="autocomplete-list" id="kitComponentAutocompleteList"></div>
                            </div>
                            <button type="button" class="btn" id="kitComponentListAllBtn"><i class="fas fa-list"></i> List All</button>
                        </div>
                    </div>
                    <ul id="componentList" class="component-list"></ul>
                    
                    <div style="margin-top: 25px; display: flex; gap: 15px;">
                        <button id="saveKitBtn" type="button" class="btn btn-success"><i class="fas fa-save"></i> Save Kit</button>
                        <button id="deleteKitBtn" type="button" class="btn btn-danger hidden"><i class="fas fa-trash"></i> Delete Kit</button>
                    </div>
                     <div id="kit-message-box" class="message-box" style="margin-top: 1rem;"></div>
                </form>
            </div>
            <div id="placeholderPanel" class="tool-card" style="display:flex; align-items:center; justify-content:center; text-align:center; min-height: 400px; color: #999;">
                <div><i class="fas fa-sitemap" style="font-size: 4rem; margin-bottom: 20px; color: #ccc;"></i><p>Select a kit from the left or create a new one to begin.</p></div>
            </div>
        </div>
    `;
}


function renderKitList() {
    const list = document.getElementById('kitList');
    const filterInput = document.getElementById('kitSearchInput');
    if (!list || !filterInput) return;
    const filter = filterInput.value.toLowerCase();
    
    const kitsToDisplay = (hubDataCache.allKits || [])
        .filter(kit => kit.kitName.toLowerCase().includes(filter))
        .sort((a, b) => a.kitName.localeCompare(b.kitName));

    if (kitsToDisplay.length === 0) {
        list.innerHTML = `<li class="mappings-placeholder" style="padding: 20px;">No kits found.</li>`;
        return;
    }

    list.innerHTML = kitsToDisplay.map(kit => {
        const isActive = currentEditingKit?.kitName === kit.kitName ? 'active' : '';
        return `
            <li class="kit-list-item ${isActive}" data-kit-name="${kit.kitName}">
                <span style="flex-grow: 1;">${kit.kitName}</span>
                <span class="status-badge" style="background-color: #6c757d;">${kit.components.length}</span>
            </li>
        `;
    }).join('');

    list.querySelectorAll('.kit-list-item').forEach(item => {
        item.addEventListener('click', () => {
            const kitName = item.dataset.kitName;
            const kitData = hubDataCache.allKits.find(k => k.kitName === kitName);
            displayKitForEditing(kitData);
        });
    });
}

function displayKitForEditing(kit) {
    currentEditingKit = kit;
    renderKitList();
    document.getElementById('placeholderPanel').classList.add('hidden');
    document.getElementById('editorPanel').classList.remove('hidden');
    
    const componentList = document.getElementById('componentList');
    componentList.innerHTML = '';
    
    if (kit) {
        document.getElementById('editorTitle').textContent = 'Editing: ' + kit.kitName;
        document.getElementById('kitName').value = kit.kitName;
        document.getElementById('kitName').readOnly = true;
        document.getElementById('kitQuantity').value = kit.kitQuantity || 0;
        document.getElementById('kitBarcode').value = kit.kitBarcode || 'Auto-generates on save';
        document.getElementById('deleteKitBtn').classList.remove('hidden');
        (kit.components || []).forEach(comp => {
            // Find the full item details from the main cache to get its total stock
            const fullItemDetails = hubDataCache.allItems.find(item => item.id === comp.barcode);
            renderComponentItem({ ...comp, ...fullItemDetails });
        });
    } else { // New Kit
        document.getElementById('editorTitle').textContent = 'Create New Kit';
        document.getElementById('kitEditorForm').reset();
        document.getElementById('kitName').readOnly = false;
        document.getElementById('deleteKitBtn').classList.add('hidden');
        document.getElementById('kitBarcode').value = 'Auto-generates on save';
    }
}

function addComponentToKit(item) {
    const barcode = item.id || item.Barcode; // Use Firestore ID first
    if (document.querySelector(`#componentList [data-barcode="${barcode}"]`)) return;
    
    // The key fix is to pass the full 'item' object, which includes 'totalStock',
    // directly to the render function.
    renderComponentItem({
        itemName: item.itemName,
        barcode: barcode,
        quantity: 1,
        totalStock: item.totalStock // Pass the totalStock here
    });
}

function renderComponentItem(component) {
    const list = document.getElementById('componentList');
    if (!list) return;
    const li = document.createElement('li');
    li.className = 'component-item';
    li.dataset.barcode = component.barcode;
    
    // Add the 'active' class if this component is the selected one
    if (component.barcode === activeComponentBarcode) {
        li.classList.add('active');
    }

    const maxStock = component.totalStock || 1;

    li.innerHTML = `
        <div class="component-info"><strong>${component.itemName}</strong> <small>(${component.barcode})</small></div>
        <label>Qty:</label>
        <input type="number" class="form-control component-qty" value="${component.quantity || 1}" min="1" max="${maxStock}">
        <i class="fas fa-times-circle remove-component-btn" title="Remove Component"></i>
    `;

    // Add click listener to set this item as active and re-render
    li.addEventListener('click', (e) => {
        if (!e.target.closest('.item-quantity-control') && !e.target.classList.contains('remove-component-btn')) {
            activeComponentBarcode = component.barcode;
            // Re-render the whole list to update highlighting
            const currentComponents = Array.from(document.querySelectorAll('#componentList .component-item')).map(itemEl => {
                const fullItem = hubDataCache.allItems.find(i => i.id === itemEl.dataset.barcode);
                return {
                    barcode: itemEl.dataset.barcode,
                    itemName: itemEl.querySelector('.component-info strong').textContent,
                    quantity: parseInt(itemEl.querySelector('.component-qty').value, 10),
                    totalStock: fullItem?.totalStock || 1
                };
            });
            list.innerHTML = '';
            currentComponents.forEach(comp => renderComponentItem(comp));
        }
    });

    li.querySelector('.remove-component-btn').addEventListener('click', () => li.remove());
    list.appendChild(li);
}

// in public/inventory-hub.js

async function handleSaveKit() {
    const kitName = document.getElementById('kitName').value.trim();
    if (!kitName) return displayMessage('Kit Name is required.', 'error', 'kit-builder-message-box');

    const components = Array.from(document.querySelectorAll('#componentList .component-item')).map(li => ({
        barcode: li.dataset.barcode,
        itemName: li.querySelector('.component-info strong').textContent,
        quantity: parseInt(li.querySelector('.component-qty').value, 10) || 1
    }));

    if (components.length === 0) return displayMessage('A kit must have at least one component.', 'error', 'kit-builder-message-box');

    const payload = { 
        kitName, 
        kitBarcode: currentEditingKit?.kitBarcode || null, 
        kitQuantity: parseInt(document.getElementById('kitQuantity').value, 10) || 0,
        components,
        isKit: true // FIX: This line ensures the item is identified as a kit
    };

    const btn = document.getElementById('saveKitBtn');
    showSpinner(btn);

    try {
        const response = await apiFetch('/api/updateKits', {
            method: 'POST',
            body: JSON.stringify({ action: 'saveKit', payload })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        // FIX: This now targets the persistent message box we created in Step 1
        displayMessage(result.message, 'success', 'kit-builder-message-box');
        
        // Reset view and refresh data
        currentEditingKit = null;
        document.getElementById('placeholderPanel').classList.remove('hidden');
        document.getElementById('editorPanel').classList.add('hidden');
        await fetchInventoryHubData(); 
        renderKitList();

    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'kit-builder-message-box');
    } finally {
        hideSpinner(btn);
    }
}

async function handleDeleteKit() {
    if (!currentEditingKit) return;

    const confirmation = confirm(`Are you sure you want to delete the kit "${currentEditingKit.kitName}"? This cannot be undone.`);
    if (!confirmation) return;

    const btn = document.getElementById('deleteKitBtn');
    showSpinner(btn);

    try {
        const response = await apiFetch('/api/updateKits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deleteKit', payload: { kitName: currentEditingKit.kitName } })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        // in public/inventory-hub.js -> handleDeleteKit()


displayMessage(result.message, 'success', 'kit-builder-message-box');
        
        currentEditingKit = null;
        document.getElementById('placeholderPanel').classList.remove('hidden');
        document.getElementById('editorPanel').classList.add('hidden');
        await fetchInventoryHubData();
        renderKitList();

    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'kit-message-box');
    } finally {
        hideSpinner(btn);
    }
}







// ==========================================================
// --- . Asset Labels ---
// ==========================================================

function renderAssetLabelsView() {
    return `
        <h3>QR Code & Barcode Label Generator</h3>
        <p>Select items from your inventory to generate printable labels for easy scanning.</p>
        <div id="asset-label-message-box" class="message-box" style="margin-top: 1rem;"></div>
        <div class="generator-grid" style="margin-top: 1.5rem;">
          <div class="config-panel">
            <h4>Configuration</h4>
            
            <div class="form-group">
                <label>1. Label Type</label>
                <div class="radio-group" style="flex-direction: row; gap: 20px;">
                    <label class="radio-label"><input type="radio" name="labelType" value="qr" checked> QR Code</label>
                    <label class="radio-label"><input type="radio" name="labelType" value="barcode"> Barcode</label>
                </div>
            </div>

            <div class="form-group">
              <label for="itemFilterInput">2. Select Items</label>
              <input type="text" id="itemFilterInput" class="form-control" placeholder="Filter items...">
              <div id="itemSelectionList" class="item-selection-list" style="margin-top: 10px;">
                <div class="loading-placeholder"><span class="spinner"></span></div>
              </div>
            </div>
            <div class="form-group">
              <label for="qrSize">3. Label Size (pixels high)</label>
              <input type="number" id="qrSize" class="form-control" value="100" min="50" max="300">
            </div>
            <div class="form-group">
              <label for="columns">4. Labels per Row</label>
              <input type="number" id="columns" class="form-control" value="3" min="1" max="10">
            </div>
            <button id="generateBtn" class="btn"><i class="fas fa-sync-alt"></i> Generate Preview</button>
          </div>
          <div class="preview-panel">
            <h4>Preview</h4>
            <p>Review the layout below. When ready, click an option.</p>
            <div id="previewArea">
              <p style="text-align: center; color: #888; margin-top: 40px;">Preview will appear here after you select items and click "Generate Preview".</p>
            </div>
            <div style="margin-top: 20px; display: flex; gap: 10px;">
                <button id="downloadBtn" class="btn btn-success">
                  <i class="fas fa-file-pdf"></i> Download PDF
                </button>
                <button id="printLabelsBtn" class="btn btn-secondary">
                  <i class="fas fa-print"></i> Print Labels
                </button>
            </div>
          </div>
        </div>
    `;
}


function attachAssetLabelsListeners() {
    renderItemListForQrGenerator(hubDataCache.allItems || []);
    
    document.getElementById('itemFilterInput')?.addEventListener('input', e => {
        const filterText = e.target.value.toLowerCase();
        const filtered = (hubDataCache.allItems || []).filter(i => 
            (i.itemName || '').toLowerCase().includes(filterText) || 
            (i.Barcode || '').toLowerCase().includes(filterText) ||
            (i.id || '').toLowerCase().includes(filterText)
        );
        renderItemListForQrGenerator(filtered);
    });

    document.getElementById('generateBtn')?.addEventListener('click', generateLabelPreview);
    document.getElementById('downloadBtn')?.addEventListener('click', downloadLabelsAsPdf);
    // This now points to the new, safe print handler
    document.getElementById('printLabelsBtn')?.addEventListener('click', handlePrintLabels);
}


function renderItemListForQrGenerator(items) {
    const listContainer = document.getElementById('itemSelectionList');
    if (!listContainer) return;

    if (!items || items.length === 0) {
        listContainer.innerHTML = `<div class="mappings-placeholder">No items found.</div>`;
        return;
    }

    listContainer.innerHTML = items
        .sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''))
        .map(item => {
            if (item.Barcode || item.id) {
                const itemId = item.id;
                return `
                    <div class="list-item" data-item-id="${itemId}">
                        <div>
                            <strong>${item.itemName}</strong>
                            <small style="display: block; margin-top: 4px; color: #555;">
                                ${item.Barcode || itemId} | Stock: ${item.totalStock}
                            </small>
                        </div>
                        <div class="qty-selector">
                            <label for="qty-${itemId}">Labels:</label>
                            <input type="number" id="qty-${itemId}" class="form-control" value="1" min="1" max="${item.totalStock || 1}" onclick="event.stopPropagation();">
                        </div>
                    </div>
                `;
            }
            return '';
        }).join('');
    
    listContainer.querySelectorAll('.list-item').forEach(el => {
        el.addEventListener('click', (e) => {
            // Only toggle selection if not clicking inside the quantity selector
            if (!e.target.closest('.qty-selector')) {
                el.classList.toggle('selected');
            }
        });
    });
}



function generateLabelPreview() {
    const previewArea = document.getElementById('previewArea');
    const selectedItems = Array.from(document.querySelectorAll('#itemSelectionList .list-item.selected'));
    
    if (selectedItems.length === 0) {
        previewArea.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">Preview will appear here after you select items and click "Generate Preview".</p>';
        displayMessage("Please select at least one item.", 'error', 'asset-label-message-box');
        return;
    }

    const labelType = document.querySelector('input[name="labelType"]:checked').value;
    const labelHeight = parseInt(document.getElementById('qrSize').value, 10);
    const columns = parseInt(document.getElementById('columns').value, 10);
    
    // Use the new .label-grid class and set the grid columns
    let previewHTML = `<div class="label-grid" style="grid-template-columns: repeat(${columns}, 1fr);">`;
    
    // This array will safely store the unique information for each barcode we need to render
    const barcodesToRender = [];

    selectedItems.forEach((element) => {
        const itemId = element.dataset.itemId;
        const item = hubDataCache.allItems.find(i => i.id === itemId);
        if (!item) return;

        const qtyInput = document.getElementById(`qty-${itemId}`);
        const quantity = qtyInput ? parseInt(qtyInput.value, 10) : 1;

        for (let i = 0; i < quantity; i++) {
            const barcodeValue = item.Barcode || item.id;
            const uniqueId = `label-code-${itemId}-${i}`;
            const textDiv = `<div class="barcode-text">${barcodeValue}</div>`;

            let codeImageHTML = '';
            if (labelType === 'qr') {
                const qr = qrcode(0, 'L');
                const searchUrl = `${window.location.origin}/search.html?barcode=${barcodeValue}`;
qr.addData(searchUrl);
                qr.make();
                codeImageHTML = qr.createImgTag(4, 0).replace('<img', '<img style="max-width: 100%; height: auto;"');
            } else {
                // Create a unique SVG placeholder for each barcode
                codeImageHTML = `<svg id="${uniqueId}"></svg>`;
                // Safely store the unique ID and value for rendering after the HTML is in the DOM
                barcodesToRender.push({ id: uniqueId, value: barcodeValue });
            }

            // Use the new .qr-label class for each label's container
            previewHTML += `<div class="qr-label">${codeImageHTML}${textDiv}</div>`;
        }
    });

    previewHTML += `</div>`;
    // Place all the generated HTML into the preview area at once
    previewArea.innerHTML = previewHTML;

    if (labelType === 'barcode') {
    barcodesToRender.forEach(barcode => {
        const targetElement = document.getElementById(barcode.id);
        if (targetElement) {
            try {
                // MODIFY THE OPTIONS OBJECT HERE
                JsBarcode(targetElement, barcode.value, {
                    format: "CODE128",
                    width: 1,            // This new option makes the bars narrower, creating a more compact barcode.
                    height: labelHeight, // This is the user-defined height.
                    displayValue: false, // We still handle text ourselves for consistent styling.
                    margin: 0
                });
            } catch (e) {
                console.error("JsBarcode rendering error:", e);
                targetElement.outerHTML = `<div class="barcode-text" style="color: red;">Error</div>`;
            }
        }
    });
}
}




function runWhenImagesAreLoaded(win, callback) {
    const images = win.document.getElementsByTagName('img');
    let loaded = images.length;

    if (loaded === 0) {
        callback();
        return;
    }

    const checkAllLoaded = () => {
        loaded--;
        if (loaded === 0) {
            callback();
        }
    };

    for (let i = 0; i < images.length; i++) {
        if (images[i].complete) {
            checkAllLoaded();
        } else {
            images[i].addEventListener('load', checkAllLoaded);
            images[i].addEventListener('error', checkAllLoaded);
        }
    }
}



function handlePrintLabels() {
    const btn = document.getElementById('printLabelsBtn');
    const selectedItems = Array.from(document.querySelectorAll('#itemSelectionList .list-item.selected'));

    if (selectedItems.length === 0) {
        return displayMessage("Please select at least one item.", 'error', 'asset-label-message-box');
    }
    
    showSpinner(btn);

    const printWindow = window.open('', '_blank', 'height=600,width=800');
    if (!printWindow) {
        hideSpinner(btn);
        return displayMessage('Could not open print window. Please disable your pop-up blocker.', 'error', 'asset-label-message-box');
    }
    
    printWindow.document.write('<html><head><title>Print Labels</title></head><body><h3>Generating labels, please wait...</h3></body></html>');
    printWindow.document.close();

    const labelType = document.querySelector('input[name="labelType"]:checked').value;
    const labelHeight = parseInt(document.getElementById('qrSize').value, 10);
    const columns = parseInt(document.getElementById('columns').value, 10);
    
    let tableHTML = `<table style="width: 100%; border-collapse: collapse; table-layout: fixed;"><tr>`;
    let colCount = 0;
    const barcodesToRenderInPrint = [];

    selectedItems.forEach((element) => {
        const itemId = element.dataset.itemId;
        const item = hubDataCache.allItems.find(i => i.id === itemId);
        if (!item) return;
        const qtyInput = document.getElementById(`qty-${itemId}`);
        const quantity = qtyInput ? parseInt(qtyInput.value, 10) : 1;

        for (let i = 0; i < quantity; i++) {
            if (colCount > 0 && colCount % columns === 0) {
                tableHTML += `</tr><tr>`;
            }
            const barcodeValue = item.Barcode || item.id;
            const uniqueId = `print-label-${itemId}-${i}`;
            const textDiv = `<div style="font-family: monospace; font-size: 10px; text-align: center; margin-top: 5px; word-break: break-all;">${barcodeValue}</div>`;
            
            let codeImageHTML = '';
            if (labelType === 'qr') {
                const qr = qrcode(0, 'L');
                const searchUrl = `${window.location.origin}/search.html?barcode=${barcodeValue}`;
qr.addData(searchUrl);
                qr.make();
                codeImageHTML = qr.createImgTag(5, 0);
            } else {
                codeImageHTML = `<svg id="${uniqueId}"></svg>`;
                barcodesToRenderInPrint.push({ id: uniqueId, value: barcodeValue });
            }
            tableHTML += `<td style="padding: 10px; text-align: center; page-break-inside: avoid; vertical-align: middle;">${codeImageHTML}${textDiv}</td>`;
            colCount++;
        }
    });
    tableHTML += `</tr></table>`;
    
    printWindow.document.body.innerHTML = tableHTML;

    if (labelType === 'barcode') {
        barcodesToRenderInPrint.forEach(barcode => {
            const barcodeElement = printWindow.document.getElementById(barcode.id);
            if (barcodeElement) {
                // *** FIX: Using the SAME compact options as the preview ***
                JsBarcode(barcodeElement, barcode.value, {
                    format: "CODE128",
                    width: 1,
                    height: labelHeight,
                    displayValue: false
                });
            }
        });
    }

    setTimeout(() => {
        hideSpinner(btn);
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    }, 500);
}



async function downloadLabelsAsPdf() {
    const btn = document.getElementById('downloadBtn');
    const selectedItems = Array.from(document.querySelectorAll('#itemSelectionList .list-item.selected'));

    if (selectedItems.length === 0) {
        return displayMessage("Please generate a preview before downloading.", 'error', 'asset-label-message-box');
    }

    showSpinner(btn);

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

        const pageMargin = 40;
        const labelPadding = 5;
        const columns = parseInt(document.getElementById('columns').value, 10);
        const labelType = document.querySelector('input[name="labelType"]:checked').value;

        const pageWidth = pdf.internal.pageSize.getWidth() - (pageMargin * 2);
        const pageHeight = pdf.internal.pageSize.getHeight() - (pageMargin * 2);
        const cellWidth = pageWidth / columns;

        let x = pageMargin;
        let y = pageMargin;
        let rowMaxHeight = 0;
        let labelsInRow = 0;

        // Create a temporary, off-screen div to render barcodes into canvases
        const tempRenderDiv = document.createElement('div');
        tempRenderDiv.style.position = 'absolute';
        tempRenderDiv.style.left = '-9999px';
        document.body.appendChild(tempRenderDiv);
        
        const allLabelsToProcess = [];
        selectedItems.forEach(element => {
            const itemId = element.dataset.itemId;
            const item = hubDataCache.allItems.find(i => i.id === itemId);
            if (!item) return;
            const qtyInput = document.getElementById(`qty-${itemId}`);
            const quantity = qtyInput ? parseInt(qtyInput.value, 10) : 1;
            for (let i = 0; i < quantity; i++) {
                allLabelsToProcess.push(item);
            }
        });

        for (const item of allLabelsToProcess) {
            const barcodeValue = item.Barcode || item.id;
            let labelImageData = null;
            let labelImageAspectRatio = 1; // Default for square QR codes

            if (labelType === 'qr') {
    const qr = qrcode(0, 'L');
    const searchUrl = `${window.location.origin}/search.html?barcode=${barcodeValue}`;
qr.addData(searchUrl);
    qr.make();
    const qrImg = new Image();

    // Use a promise to wait for the QR code image to be ready
    await new Promise(resolve => {
        qrImg.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const qrSize = 120;    // Define a base size for the QR image
            const textHeight = 30; // Reserve space for the text
            const padding = 10;

            // Set the canvas size to fit both the QR image and the text
            canvas.width = qrSize + padding * 2;
            canvas.height = qrSize + textHeight + padding;

            // Draw a white background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw the QR code image onto the canvas
            ctx.drawImage(qrImg, padding, padding, qrSize, qrSize);

            // Draw the text below the QR code
            ctx.fillStyle = 'black';
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(barcodeValue, canvas.width / 2, qrSize + padding + 16);

            // Get the final image data from the composite canvas
            labelImageData = canvas.toDataURL('image/png');
            labelImageAspectRatio = canvas.width / canvas.height;
            resolve();
        };
        // This line triggers the image loading process
        qrImg.src = qr.createDataURL(5, 0);
    });
} else { // The barcode logic remains unchanged as it is working correctly
    const canvas = document.createElement('canvas');
    tempRenderDiv.appendChild(canvas);
    try {
        JsBarcode(canvas, barcodeValue, {
            format: "CODE128",
            width: 2,
            height: 60,
            displayValue: true,
            fontSize: 16,
            margin: 10
        });
        labelImageData = canvas.toDataURL('image/png');
        labelImageAspectRatio = canvas.width / canvas.height;
    } catch (e) {
        console.error('Error rendering barcode to canvas', e);
        continue;
    }
}

            if (!labelImageData) continue;

            const imageWidth = cellWidth - (labelPadding * 2);
            const imageHeight = imageWidth / labelImageAspectRatio;

            if (y + imageHeight > pageHeight + pageMargin) {
                pdf.addPage();
                y = pageMargin;
                x = pageMargin;
                rowMaxHeight = 0;
                labelsInRow = 0;
            }

            pdf.addImage(labelImageData, 'PNG', x + labelPadding, y, imageWidth, imageHeight);

            if (imageHeight > rowMaxHeight) {
                rowMaxHeight = imageHeight;
            }

            x += cellWidth;
            labelsInRow++;
            if (labelsInRow >= columns) {
                x = pageMargin;
                y += rowMaxHeight + labelPadding;
                rowMaxHeight = 0;
                labelsInRow = 0;
            }
        }
        
        document.body.removeChild(tempRenderDiv); // Clean up the temporary div
        pdf.save('NexVentory_Labels.pdf');

    } catch (error) {
        console.error('Error generating PDF:', error);
        displayMessage('An error occurred while generating the PDF.', 'error', 'asset-label-message-box');
    } finally {
        hideSpinner(btn);
    }
}







function renderLocationManagerView() {
    return `
        <h3><i class="fas fa-map-signs"></i> Location Manager</h3>
        <p>This tool scans your inventory for items with improperly formatted locations. Use it to find and fix historical data entry errors from manual entry or CSV imports.</p>
        <div class="tool-card" style="margin-top: 1.5rem;">
            <h4>Scan All Locations</h4>
            <p>Click the button below to start a full scan. Any items requiring review will be presented in a pop-up window for correction.</p>
            <button id="scanAllLocationsBtn" class="btn"><i class="fas fa-search-location"></i> Scan Entire Inventory</button>
            <div id="location-manager-message-box" class="message-box" style="margin-top: 1rem;"></div>
        </div>
    `;
}

function attachLocationManagerListeners() {
    document.getElementById('scanAllLocationsBtn')?.addEventListener('click', handleScanAllLocations);
}

async function handleScanAllLocations() {
    const btn = document.getElementById('scanAllLocationsBtn');
    showSpinner(btn);
    try {
        const response = await apiFetch('/api/updateInventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // FIX: Added an empty payload object to match backend requirements.
            body: JSON.stringify({ action: 'scanInvalidLocations', payload: {} })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        if (result.items && result.items.length > 0) {
            displayMessage(`Found ${result.items.length} items that need location review.`, 'info', 'location-manager-message-box');
            showLocationReviewModal(result.items);
        } else {
            displayMessage('Scan complete. All item locations are correctly formatted!', 'success', 'location-manager-message-box');
        }
    } catch (error) {
        displayMessage(`Error during scan: ${error.message}`, 'error', 'location-manager-message-box');
    } finally {
        hideSpinner(btn);
    }
}

function showLocationReviewModal(items) {
    const modal = document.getElementById('locationReviewModal');
    const list = document.getElementById('location-review-list');
    if (!modal || !list) return;

    list.innerHTML = '';
    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'user-list-item location-review-item';
        li.dataset.id = item.id;
        li.innerHTML = `
            <div>
                <strong>${item.itemName}</strong> <small>(${item.id})</small>
                <br>
                Current Location: <span class="problematic-location">${item.location}</span>
            </div>
            <div class="correction-form">
                <div class="form-group">
                    <label>New Zone</label>
                    <input type="text" class="form-control correction-zone" placeholder="e.g., Zone A">
                </div>
                <div class="form-group">
                    <label>New Row / Shelf / Bin</label>
                    <input type="text" class="form-control correction-row" placeholder="e.g., Shelf 3 - Bin 2">
                </div>
            </div>
        `;
        list.appendChild(li);
    });
    
    modal.querySelector('.modal-close').onclick = () => modal.classList.remove('active');
    document.getElementById('saveReviewedLocationsBtn').onclick = handleSaveReviewedLocations;
    modal.classList.add('active');
}

async function handleSaveReviewedLocations() {
    const btn = document.getElementById('saveReviewedLocationsBtn');
    const updates = [];
    document.querySelectorAll('#location-review-list .location-review-item').forEach(item => {
        const zone = item.querySelector('.correction-zone').value.trim();
        const row = item.querySelector('.correction-row').value.trim();
        if (zone && row) {
            updates.push({
                id: item.dataset.id,
                newLocation: `${zone} - ${row}`
            });
        }
    });

    if (updates.length === 0) {
        return displayMessage('No corrections entered. Fill out both fields for at least one item.', 'error', 'location-review-message-box');
    }

    showSpinner(btn);
    try {
        const response = await apiFetch('/api/updateInventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'batchUpdateLocations', payload: { updates } })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        displayMessage(result.message, 'success', 'location-review-message-box', 2000);
        setTimeout(() => {
            document.getElementById('locationReviewModal').classList.remove('active');
            fetchInventoryHubData(); // Refresh data to reflect changes
        }, 1500);

    } catch (error) {
        displayMessage(`Error saving corrections: ${error.message}`, 'error', 'location-review-message-box');
    } finally {
        hideSpinner(btn);
    }
}