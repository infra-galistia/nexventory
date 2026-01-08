// public/operations.js
// This is the complete and corrected script for the Operations page,
// including all previous fixes for functionality and syntax.

// --- 1. PAGE-SPECIFIC STATE & CACHE ---
let activeView = 'Checkout';
let checkoutCart = [];
let selectedCheckoutUser = null;
let activeCheckoutItemBarcode = null;

// Bulk/Kit state
let selectedProjectKit = null;
let bulkCheckoutMode = 'complete'; // 'complete' or 'manual'
let bulkManualItems = []; // For manual assembly
let activeManualAssemblyBarcode = null; // For highlighting one component
let selectedBulkUser = null;


// State for Check-in Tab
let checkinMode = 'individual';
let itemForCheckin = null;
let selectedUserForReturn = null; // Add this line
let selectedKitForReturn = null;  // Add this line

// --- 2. INITIALIZATION ---

function onAuthReady(user) {
    const opsContainer = document.getElementById('operations-container');
    if (!opsContainer) return;
    opsContainer.style.display = 'block';

    if (user) {
        fetchOperationsPageData();
    } else {
        const mainLoader = document.getElementById('main-loader');
        if (mainLoader) mainLoader.innerHTML = `<div class="content-block" style="text-align:center;"><h2>Please Sign In</h2><p>Operations require authentication.</p></div>`;
        hideAppPreloader();
    }
}

async function fetchOperationsPageData() {
    const mainLoader = document.getElementById('main-loader');
    const opsContent = document.getElementById('operations-content');
    try {
        mainLoader.style.display = 'flex';
        if(opsContent) opsContent.style.display = 'none';

        const response = await apiFetch('/api/getOperationsPageData', {
            method: 'POST',
            body: JSON.stringify({})
        });
        if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
        
        window.pageDataCache = await response.json();

        if (mainLoader) mainLoader.style.display = 'none';
        if (opsContent) opsContent.style.display = 'block';
        
        const params = new URLSearchParams(window.location.search);
        const view = params.get('view');
        if (['Checkout', 'CheckIn', 'Intradepartment', 'LostDamage'].includes(view)) {
            activeView = view;
        }
        
        attachPrimaryEventListeners(); // NEW: Attach the main controller
        renderContent(); // Initial render

    } catch (error) {
        console.error("Could not fetch operations data:", error);
        if(mainLoader) mainLoader.innerHTML = `<div class="message-box error" style="display:block;">Failed to load page data.</div>`;
    } finally {
        hideAppPreloader();
    }
}

// --- 3. UI RENDERING & CORE LOGIC ---

function attachPrimaryEventListeners() {
    // This is the new main controller for the page
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) {
        sidebar.addEventListener('click', (e) => {
            const link = e.target.closest('.nav-link');
            if (link && link.dataset.view) {
                e.preventDefault();
                activeView = link.dataset.view;
                renderContent(); // Re-render content when sidebar link is clicked
            }
        });
    }
}


// --- 3. VIEW RENDERING & CORE UI LOGIC ---

function renderCheckoutView() {
    const showStudentTab = AppConfig.features.studentsEnabled;

    return `
        <h2 id="checkout-main-title"><i class="fas fa-arrow-up"></i> Check Out Items</h2>
        <div class="message-box" id="checkout-message-box"></div>
        <div class="tab-navigation" id="checkout-user-type-tabs">
            <button class="tab-button active" data-tab="staff"><i class="fas fa-user-tie"></i> For Faculty/Staff</button>
            
            ${showStudentTab ? `<button class="tab-button" data-tab="student"><i class="fas fa-user-graduate"></i> For Student</button>` : ''}
            
            <button class="tab-button" data-tab="bulk"><i class="fas fa-boxes"></i> Project Kits/Bulk</button>
        </div>
        <div id="checkoutForm"></div>`;
}
function renderContent() {
    const contentPanel = document.getElementById('content-panel');
    if (!contentPanel) return;
    
    // Highlight the active link in the main sidebar
    document.querySelectorAll('#app-sidebar .nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.view === activeView);
    });

    contentPanel.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
    
    const viewContainer = document.getElementById(`view-${activeView}`);
    if (viewContainer) {
        switch(activeView) {
            case 'Checkout':
                resetCheckoutFormState();
                viewContainer.innerHTML = renderCheckoutView();
                attachCheckoutListeners();
                break;
            case 'CheckIn':
                viewContainer.innerHTML = renderCheckInView();
                attachCheckInListeners();
                break;
            case 'Intradepartment':
                viewContainer.innerHTML = renderIntradepartmentView();
                attachIntradepartmentListeners();
                break;
            case 'LostDamage':
                viewContainer.innerHTML = renderLostDamageView();
                attachLostDamageListeners();
                break;
        }
        viewContainer.classList.add('active');
    }
}

function renderSidebar() {
    // The sidebar HTML is now rendered by the global script.js.
    // This function's new role is to attach the click handlers.
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;

    sidebar.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault(); // Prevent the link from trying to navigate away
            
            // Get the view name from the 'data-view' attribute we set in script.js
            const viewToActivate = this.dataset.view;
            if (viewToActivate) {
                activeView = viewToActivate;
                
                // Re-render the content based on the new active view
                renderContent();
            }
        });
    });
}

function attachViewListeners() {
    switch (activeView) {
        case 'Checkout': attachCheckoutListeners(); break;
        case 'CheckIn': attachCheckInListeners(); break;
        case 'Intradepartment': attachIntradepartmentListeners(); break;
        case 'LostDamage': attachLostDamageListeners(); break;
    }
}


// --- 4. CHECKOUT-SPECIFIC LOGIC ---

function attachCheckoutListeners() {
    const userTypeTabs = document.getElementById('checkout-user-type-tabs');
    if (userTypeTabs) {
        userTypeTabs.addEventListener('click', handleCheckoutTabClick);
        handleCheckoutTabClick({ target: userTypeTabs.querySelector('.active') });
    }
}

function handleCheckoutTabClick(e) {
    const target = e.target.closest('.tab-button');
    if (!target) return;
    
    document.querySelectorAll('#checkout-user-type-tabs .tab-button').forEach(btn => btn.classList.remove('active'));
    target.classList.add('active');
    
    resetCheckoutFormState();
    renderCheckoutUserSelection(target.dataset.tab);
}

function resetCheckoutFormState() {
    checkoutCart = [];
    selectedCheckoutUser = null;
    activeCheckoutItemBarcode = null;
    selectedProjectKit = null;
    bulkManualItems = [];
    activeManualAssemblyBarcode = null;
    selectedBulkUser = null;
    const title = document.getElementById('checkout-main-title');
    if (title) title.innerHTML = `<i class="fas fa-arrow-up"></i> Check Out Items`;
}

// In /public/operations.js
// REPLACE the existing renderCheckoutUserSelection function with this one

function renderCheckoutUserSelection(userType) {
    const formContainer = document.getElementById('checkoutForm');
    if (!formContainer) return;

    let userSelectHTML = '', selectId = '', placeholder = '';
    
    if (userType === 'staff' || userType === 'bulk') {
        const staffOptions = (window.pageDataCache.staffList || []).map(p => `<option value="${p.name} (${p.email})">${p.name} (${p.email})</option>`).join('');
        selectId = userType === 'staff' ? 'staffDatabaseSelect' : 'bulkStaffDatabaseSelect';
        placeholder = '-- Select Staff --';
        userSelectHTML = `<select id="${selectId}" class="form-control"><option value="">${placeholder}</option>${staffOptions}</select>`;
    } else if (userType === 'student') {
        const studentOptions = (window.pageDataCache.studentList || []).map(s => `<option value="${s.name} (${s.id})">${s.name} (${s.id})</option>`).join('');
        selectId = 'studentDatabaseSelect';
        placeholder = '-- Select Student --';
        userSelectHTML = `<select id="${selectId}" class="form-control"><option value="">${placeholder}</option>${studentOptions}</select>`;
    }

    // This variable holds the department options
    const departmentOpts = (window.pageDataCache.dropdowns?.Departments || []).map(d => `<option value="${d}">${d}</option>`).join('');
    
    const mainFormHTML = `
        <div class="content-block" id="user-selection-area">
            <h4>Select User</h4>
            <div class="form-group">${userSelectHTML}</div>
        </div>
        <div id="checkout-main-form-wrapper" class="hidden">
            <div id="individual-item-selection" class="content-block">
                <h4>1. Select Item(s)</h4>
                <div class="item-selector-group">
                    <div class="form-group" style="flex-grow:1;"><input type="text" id="checkoutSearchInput" class="form-control" autocomplete="off" placeholder="Search available items..."><div class="autocomplete-list" id="checkoutAutocompleteList"></div></div>
                    <button type="button" class="btn btn-secondary" id="checkoutScanBtn"><i class="fas fa-qrcode"></i> Scan</button>
                    <button type="button" class="btn btn-secondary" id="checkoutListItemBtn"><i class="fas fa-list"></i> List All</button>
                </div>
                <h4 style="margin-top: 20px;">Items to Check Out</h4>
                <ul id="checkout-cart-list" class="selected-items-list"><li class="placeholder">No items selected.</li></ul>
            </div>
            
            <div id="bulk-kit-selection" class="content-block">
                 <h4>1. Select Project Kit</h4>
                 <div class="item-selector-group">
                    <div class="form-group" style="flex-grow:1;">
                        <input type="text" id="bulkSearchInput" class="form-control" autocomplete="off" placeholder="Search available kits...">
                        <div class="autocomplete-list" id="bulkAutocompleteList"></div>
                    </div>
                    <button type="button" class="btn btn-secondary" id="bulkScanBtn"><i class="fas fa-qrcode"></i> Scan Kit</button>
                    <button type="button" class="btn btn-secondary" id="bulkListItemBtn"><i class="fas fa-list"></i> List All Kits</button>
                </div>
                <div id="bulk-selected-kit-container" class="hidden" style="margin-top: 20px;"></div>
                <div id="bulk-checkout-mode-block" class="hidden" style="margin-top: 20px;"></div>
            </div>
            
            <div id="checkout-item-details-wrapper" class="content-block hidden"></div>
            
            <div id="contextBlock" class="content-block hidden">
                <h4>2. Context</h4>
                <div class="form-grid">
                    <!-- THIS IS THE FIX: Changed programOpts to departmentOpts -->
                    <div class="form-group"><label for="checkoutDepartment">Department</label><select id="checkoutDepartment" class="form-control" required><option value="">-- Select --</option>${departmentOpts}</select></div>
                    <div id="checkoutProgramGroup" class="form-group hidden"><label for="checkoutProgram">Program</label><select id="checkoutProgram" class="form-control" required></select></div>
                    <div id="checkoutCourseGroup" class="form-group hidden"><label for="checkoutCourse">Course</label><select id="checkoutCourse" class="form-control" required></select></div>
                    <div id="checkoutPurposeGroup" class="form-group hidden"><label for="checkoutPurpose">Purpose</label><select id="checkoutPurpose" class="form-control" required></select></div>
                </div>
                <div class="form-group" style="margin-top:20px;"><label for="checkoutNotes">Notes (Optional)</label><textarea id="checkoutNotes" class="form-control" placeholder="Any relevant notes..."></textarea></div>
            </div>

            <div id="finalizeButtonBlock" class="hidden" style="margin-top: 30px; text-align:right;">
                <button type="button" id="processCheckoutBtn" class="btn btn-success">Process Check-Out</button>
            </div>
            <div id="checkout-process-message-box" class="message-box" style="margin-top: 15px; text-align: right;"></div>
        </div>`;

    formContainer.innerHTML = mainFormHTML;
    document.getElementById(selectId)?.addEventListener('change', (e) => handleUserSelected(e, userType));
}

function handleUserSelected(e, userType) {
    const selectedValue = e.target.value;
    const formWrapper = document.getElementById('checkout-main-form-wrapper');

    if (selectedValue) {
        if (userType === 'bulk') {
            selectedBulkUser = selectedValue;
        } else {
            selectedCheckoutUser = selectedValue;
        }
        
        document.getElementById('checkout-main-title').innerHTML = `<i class="fas fa-arrow-up"></i> Check Out Items For: <strong>${selectedValue}</strong>`;
        
        formWrapper.classList.remove('hidden');
        if (userType !== 'bulk') {
            document.getElementById('contextBlock').classList.remove('hidden');
        }
        
        const individualPanel = document.getElementById('individual-item-selection');
        const bulkPanel = document.getElementById('bulk-kit-selection');
        
        if (userType === 'bulk') {
            individualPanel.classList.add('hidden');
            bulkPanel.classList.remove('hidden');
            
            const projectKits = (window.pageDataCache.allItems || []).filter(item => item.isKit === true && (item.currentStock || 0) > 0);
            
            setupItemSelector('bulk', handleProjectKitSelected, () => projectKits);
            document.getElementById('bulkScanBtn')?.addEventListener('click', () => handleScanClick(handleProjectKitSelected));
            document.getElementById('bulkListItemBtn')?.addEventListener('click', () => handleListAllClick(projectKits, handleProjectKitSelected));

        } else {
            bulkPanel.classList.add('hidden');
            individualPanel.classList.remove('hidden');
            
            const availableItems = (window.pageDataCache.allItems || []).filter(item => (item.currentStock || 0) > 0);
            setupItemSelector('checkout', handleAddItemToCheckoutCart, () => availableItems);
            document.getElementById('checkoutScanBtn')?.addEventListener('click', () => handleScanClick(handleAddItemToCheckoutCart));
            document.getElementById('checkoutListItemBtn')?.addEventListener('click', () => handleListAllClick(availableItems, handleAddItemToCheckoutCart));
        }
        
        document.getElementById('contextBlock')?.addEventListener('change', handleContextChange);
    } else {
        resetCheckoutFormState();
        renderCheckoutUserSelection(userType);
    }
}

function handleAddItemToCheckoutCart(item) {
    if (checkoutCart.some(ci => ci.item.Barcode === item.Barcode)) {
        displayMessage('Item is already in the cart.', 'info', 'checkout-message-box');
        return;
    }
    checkoutCart.push({ item: item, quantity: 1 });
    activeCheckoutItemBarcode = item.Barcode;
    renderCheckoutCart();
}

function renderCheckoutCart() {
    const listContainer = document.getElementById('checkout-cart-list');
    if (!listContainer) return;

    if (checkoutCart.length === 0) {
        listContainer.innerHTML = `<li class="placeholder">No items selected.</li>`;
    } else {
        listContainer.innerHTML = checkoutCart.map(cartItem => {
            const item = cartItem.item;
            const isActive = item.Barcode === activeCheckoutItemBarcode ? 'active' : '';
            return `<li class="${isActive}" data-barcode="${item.Barcode}">
                        <div class="item-name-details">${item.itemName} <small>(${item.Barcode})</small></div>
                        <div class="item-quantity-control">
                            <button type="button" class="qty-btn minus-btn" data-barcode="${item.Barcode}">-</button>
                            <input type="number" class="qty-input" value="${cartItem.quantity}" min="1" max="${item.currentStock || 1}" data-barcode="${item.Barcode}">
                            <button type="button" class="qty-btn plus-btn" data-barcode="${item.Barcode}">+</button>
                        </div>
                        <i class="fas fa-times-circle remove-item" data-barcode="${item.Barcode}"></i>
                    </li>`;
        }).join('');
    }

    const existingBtn = document.getElementById('addOtherItemsBtn');
    if (existingBtn) existingBtn.remove();
    
    if (checkoutCart.length > 0) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.id = 'addOtherItemsBtn';
        addBtn.className = 'btn btn-secondary';
        addBtn.style.marginTop = '15px';
        addBtn.innerHTML = `<i class="fas fa-plus"></i> Add Other Items`;
        listContainer.insertAdjacentElement('afterend', addBtn);

        addBtn.addEventListener('click', () => {
            const cartBarcodes = checkoutCart.map(ci => ci.item.Barcode);
            const allAvailableItems = (window.pageDataCache.allItems || []).filter(item => (item.currentStock || 0) > 0);
            const itemsToAdd = allAvailableItems.filter(item => !cartBarcodes.includes(item.Barcode));
            handleListAllClick(itemsToAdd, handleAddItemToCheckoutCart);
        });
    }

    const detailsWrapper = document.getElementById('checkout-item-details-wrapper');
    const activeCartItem = checkoutCart.find(ci => ci.item.Barcode === activeCheckoutItemBarcode);
    if (activeCartItem) {
        renderSelectedItemDetails(activeCartItem.item, 'checkout-item-details-wrapper');
        detailsWrapper.classList.remove('hidden');
    } else {
        detailsWrapper.classList.add('hidden');
    }
    
    attachCartListeners();
    checkFormCompletion();
}

function attachCartListeners() {
    const cartList = document.getElementById('checkout-cart-list');
    if (!cartList) return;
    
    cartList.addEventListener('click', (e) => {
        const target = e.target;
        const parentLi = target.closest('li');
        if (!parentLi || parentLi.classList.contains('placeholder')) return;
        
        const barcode = parentLi.dataset.barcode;

        if (target.matches('.remove-item')) {
            checkoutCart = checkoutCart.filter(ci => ci.item.Barcode !== barcode);
            if (activeCheckoutItemBarcode === barcode) {
                activeCheckoutItemBarcode = checkoutCart.length > 0 ? checkoutCart[0].item.Barcode : null;
            }
            renderCheckoutCart();
        } else if (target.matches('.qty-btn')) {
            const cartItem = checkoutCart.find(ci => ci.item.Barcode === barcode);
            if (!cartItem) return;
            let qty = cartItem.quantity;
            if (target.classList.contains('plus-btn')) qty++; else qty--;
            if (qty < 1) qty = 1;
            if (qty > cartItem.item.currentStock) qty = cartItem.item.currentStock;
            cartItem.quantity = qty;
            parentLi.querySelector('.qty-input').value = qty;
        } else {
            activeCheckoutItemBarcode = barcode;
            renderCheckoutCart();
        }
    });

    cartList.addEventListener('change', (e) => {
        if (e.target.matches('.qty-input')) {
            const barcode = e.target.closest('li').dataset.barcode;
            const cartItem = checkoutCart.find(ci => ci.item.Barcode === barcode);
            if (cartItem) {
                let qty = parseInt(e.target.value, 10);
                const maxStock = parseInt(cartItem.item.currentStock, 10);
                if (isNaN(qty) || qty < 1) qty = 1;
                if (qty > maxStock) qty = maxStock;
                cartItem.quantity = qty;
                e.target.value = qty;
            }
        }
    });
}

function handleContextChange(e) {
    if (e.target.tagName !== 'SELECT') return;

    const targetId = e.target.id;
    const deptSelect = document.getElementById('checkoutDepartment');
    const programGroup = document.getElementById('checkoutProgramGroup');
    const courseGroup = document.getElementById('checkoutCourseGroup');
    const purposeGroup = document.getElementById('checkoutPurposeGroup');
    const programSelect = document.getElementById('checkoutProgram');
    const courseSelect = document.getElementById('checkoutCourse');
    const purposeSelect = document.getElementById('checkoutPurpose');

    if (!deptSelect || !programGroup || !courseGroup || !purposeGroup || !programSelect || !courseSelect || !purposeSelect) return;

    const departmentMap = window.pageDataCache.dropdowns?.DepartmentMap || {};

    if (targetId === 'checkoutDepartment') {
        const selectedDept = deptSelect.value;
        const programsForDept = selectedDept ? Object.keys(departmentMap[selectedDept]?.Programs || {}) : [];
        
        programGroup.classList.add('hidden');
        courseGroup.classList.add('hidden');
        purposeGroup.classList.add('hidden');

        if (selectedDept && programsForDept.length > 0) {
            populateSelect(programSelect, programsForDept.sort(), "-- Select a Program --");
            programGroup.classList.remove('hidden');
        } else if (selectedDept) {
            populateSelect(purposeSelect, window.pageDataCache.dropdowns.Purpose || [], "-- Select a Purpose --");
            purposeGroup.classList.remove('hidden');
        }
    }

    if (targetId === 'checkoutProgram') {
        const selectedDept = deptSelect.value;
        const selectedProg = programSelect.value;
        const coursesForProg = departmentMap[selectedDept]?.Programs?.[selectedProg] || [];

        courseGroup.classList.add('hidden');
        purposeGroup.classList.add('hidden');

        if (selectedProg && coursesForProg.length > 0) {
            populateSelect(courseSelect, coursesForProg.sort(), "-- Select a Course --");
            courseGroup.classList.remove('hidden');
        } else if (selectedProg) {
            populateSelect(purposeSelect, window.pageDataCache.dropdowns.Purpose || [], "-- Select a Purpose --");
            purposeGroup.classList.remove('hidden');
        }
    }

    if (targetId === 'checkoutCourse') {
        if (e.target.value) {
            populateSelect(purposeSelect, window.pageDataCache.dropdowns.Purpose || [], "-- Select a Purpose --");
            purposeGroup.classList.remove('hidden');
        } else {
            purposeGroup.classList.add('hidden');
        }
    }
    
    checkFormCompletion();
}

function checkFormCompletion() {
    const finalizeBlock = document.getElementById('finalizeButtonBlock');
    if (!finalizeBlock) return;

    let isComplete = false;
    const userSelected = selectedCheckoutUser || selectedBulkUser;
    const itemsSelected = checkoutCart.length > 0 || (selectedProjectKit && bulkManualItems.some(i => i.isChecked));
    const programSelected = document.getElementById('checkoutProgram')?.value;
    const courseSelected = document.getElementById('checkoutCourse')?.value;
    const purposeSelected = document.getElementById('checkoutPurpose')?.value;
    
    let contextComplete = false;
    if (programSelected) {
        if (!document.getElementById('checkoutCourseGroup').classList.contains('hidden')) {
            if (courseSelected) {
                if (!document.getElementById('checkoutPurposeGroup').classList.contains('hidden')) {
                    if(purposeSelected) contextComplete = true;
                } else {
                    contextComplete = true;
                }
            }
        } else if (!document.getElementById('checkoutPurposeGroup').classList.contains('hidden')) {
            if (purposeSelected) contextComplete = true;
        } else {
             contextComplete = true;
        }
    }

    if (userSelected && itemsSelected && contextComplete) {
        isComplete = true;
    }
    
    finalizeBlock.classList.toggle('hidden', !isComplete);
    
    if (isComplete) {
        const processBtn = document.getElementById('processCheckoutBtn');
        const newBtn = processBtn.cloneNode(true);
        processBtn.parentNode.replaceChild(newBtn, processBtn);
        newBtn.addEventListener('click', handleProcessCheckout);
    }
}

function populateSelect(selectElement, optionsArray, placeholder, valuesArray) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    optionsArray.forEach((optionText, index) => {
        const optionValue = valuesArray ? valuesArray[index] : optionText;
        const option = new Option(optionText, optionValue);
        selectElement.add(option);
    });
}

// --- 5. BULK/KIT CHECKOUT FLOW ---

// in public/operations.js

/**
 * Handles the selection of a project kit.
 * This version is corrected to validate that all components exist and are in stock
 * before allowing the checkout process to continue.
 */
function handleProjectKitSelected(kit) {
    if (!kit) return;
    
    // --- VALIDATION FIX STARTS HERE ---
    
    // 1. Check if all components listed in the kit actually exist in the main inventory.
    const allItems = window.pageDataCache.allItems || [];
    const missingComponents = [];
    const outOfStockComponents = [];

    kit.components.forEach(comp => {
        const fullItemDetails = allItems.find(i => i.Barcode === comp.barcode);
        if (!fullItemDetails) {
            missingComponents.push(comp.name);
        } else if ((fullItemDetails.currentStock || 0) < comp.requiredQty) {
            // 2. Check if the existing components have enough stock.
            outOfStockComponents.push(`${comp.name} (Required: ${comp.requiredQty}, Available: ${fullItemDetails.currentStock || 0})`);
        }
    });

    // 3. If there are any issues, show an error message and stop the process.
    if (missingComponents.length > 0 || outOfStockComponents.length > 0) {
        let errorMessage = "<strong>This kit cannot be checked out due to component issues:</strong><br><ul>";
        if (missingComponents.length > 0) {
            errorMessage += `<li>The following components do not exist in the inventory: ${missingComponents.join(', ')}</li>`;
        }
        if (outOfStockComponents.length > 0) {
            errorMessage += `<li>The following components are out of stock: ${outOfStockComponents.join(', ')}</li>`;
        }
        errorMessage += "</ul><p>Please resolve these issues in the Admin Panel before checking out this kit.</p>";
        
        // Use a more prominent way to show this critical error.
        showConfirmationModal('Kit Incomplete', errorMessage, () => {});
        return; // Stop the function here
    }
    // --- VALIDATION FIX ENDS HERE ---


    // If validation passes, proceed with the original logic.
    selectedProjectKit = kit;
    activeManualAssemblyBarcode = null;
    document.getElementById('bulk-selected-kit-container').classList.remove('hidden');
    document.getElementById('bulk-checkout-mode-block').classList.remove('hidden');
    document.getElementById('contextBlock').classList.remove('hidden');
    renderSelectedKitSummary();
    renderBulkCheckoutMode();
    checkFormCompletion();
}


// in public/operations.js

/**
 * Renders the summary of the selected kit.
 * REVISED to include the +/- quantity buttons.
 */
function renderSelectedKitSummary() {
    const container = document.getElementById('bulk-selected-kit-container');
    if (!container || !selectedProjectKit) return;

    const maxKits = selectedProjectKit.currentStock || 1;

    // This HTML structure re-introduces the full item-quantity-control with buttons.
    container.innerHTML = `
        <h4>Selected Kit:</h4>
        <ul class="selected-items-list">
            <li class="active">
                <span class="item-name-details">${selectedProjectKit.itemName} <small>(${selectedProjectKit.Barcode || ''})</small></span>
                <div class="item-quantity-control">
                    <button type="button" class="qty-btn minus-btn">-</button>
                    <input type="number" class="qty-input" value="1" min="1" max="${maxKits}" id="bulk-kit-quantity">
                    <button type="button" class="qty-btn plus-btn">+</button>
                </div>
                <i class="fas fa-times-circle remove-item" title="Clear Selection"></i>
            </li>
        </ul>`;
    
    // Add listener to clear selection
    container.querySelector('.remove-item').addEventListener('click', () => {
        const currentUser = selectedBulkUser;
        resetCheckoutFormState();
        renderCheckoutUserSelection('bulk');
        // Re-select the user to keep the form open
        const userSelect = document.getElementById('bulkStaffDatabaseSelect');
        if (userSelect) {
            userSelect.value = currentUser;
            // Dispatch a change event to re-trigger the form logic
            userSelect.dispatchEvent(new Event('change'));
        }
    });

    // Add listeners for the new +/- buttons
    container.querySelectorAll('.qty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById('bulk-kit-quantity');
            if (!input) return;
            
            let currentValue = parseInt(input.value, 10);
            const max = parseInt(input.max, 10);

            if (btn.classList.contains('plus-btn')) {
                if (currentValue < max) currentValue++;
            } else { // minus-btn
                if (currentValue > 1) currentValue--;
            }
            input.value = currentValue;
        });
    });
}

function renderBulkCheckoutMode() {
    const container = document.getElementById('bulk-checkout-mode-block');
    if (!container) return;
    container.innerHTML = `
        <h4>2. Checkout Mode</h4>
        <div class="form-group">
            <select id="bulkCheckoutModeSelect" class="form-control">
                <option value="complete">Complete Kit (Default)</option>
                <option value="manual">Assemble Manually</option>
            </select>
        </div>
        <div id="bulk-kit-details-container"></div>`;
    
    document.getElementById('bulkCheckoutModeSelect').addEventListener('change', (e) => {
        bulkCheckoutMode = e.target.value;
        renderBulkKitDetails();
    });
    renderBulkKitDetails();
}

function renderBulkKitDetails() {
    const container = document.getElementById('bulk-kit-details-container');
    if (!container || !selectedProjectKit) return;

    // This part remains the same
    bulkManualItems = selectedProjectKit.components.map(c => {
        const fullItem = (window.pageDataCache.allItems || []).find(i => i.Barcode === c.barcode);
        return {
            ...c,
            fullItem: fullItem || {},
            isChecked: true,
            quantityToCheckout: c.requiredQty,
        };
    });

    if (bulkCheckoutMode === 'complete') {
        // --- THIS IS THE MODIFIED LOGIC FOR "COMPLETE KIT" MODE ---

        // 1. Build the list of components WITHOUT individual location bars.
        const componentsList = bulkManualItems.map(item => `
            <li class="checkoff-list-item read-only">
                <i class="fas fa-box-open component-icon"></i>
                <div class="component-details">
                    <span class="component-name">${item.name}</span>
                    <small>Required: ${item.requiredQty} | Stock: ${item.fullItem.currentStock || 0} | Status: ${item.fullItem.loanStatus || 'N/A'}</small>
                </div>
            </li>
        `).join('');

        // 2. Determine the single location for the entire kit.
        const kitLocation = selectedProjectKit.Location || 'Multiple Locations';
        
        // 3. Render the list, followed by the single location bar and the "Show All" button.
         container.innerHTML = `
            <h5>Default Components:</h5>
            <ul class="checkoff-list">${componentsList}</ul>
            <div class="location-bar" style="margin-top: 15px;">
                <i class="fas fa-map-marker-alt"></i> ${kitLocation}
            </div>
            <button type="button" class="btn visual-layout-toggle" id="showAllComponentsBtn" style="margin-top: 15px;">
                <i class="fas fa-eye"></i> Show Visual Location
            </button>
            <div class="visual-layout-container hidden"></div>
        `;
        
        document.getElementById('showAllComponentsBtn').addEventListener('click', (e) => {
            const itemsToHighlight = bulkManualItems.map(i => i.fullItem).filter(Boolean);
            // Assuming toggleVisualLayout can handle an array of items
            toggleVisualLayout(itemsToHighlight, e.currentTarget);
        });

    } else {
        // The logic for 'manual' mode remains unchanged as it already matches the layout.
        renderManualAssemblyView();
    }
}

/**
 * Renders the "Assemble Manually" view.
 * MODIFIED to hide the "Show Visual Location" button by default.
 */


function renderManualAssemblyView() {
    const container = document.getElementById('bulk-kit-details-container');
    if (!container) return;

    // --- Part 1: Prepare data for rendering ---
    const removedItems = [];
    const addedItems = [];
    
    bulkManualItems.forEach(item => {
        // A default item that is unchecked is "removed"
        if (!item.isAdded && !item.isChecked) {
            removedItems.push(item.name);
        }
        // An added item that is checked is "added"
        if (item.isAdded && item.isChecked) {
            addedItems.push(item.name);
        }
    });

    // --- Part 2: Build the main component checklist HTML ---
    const listHTML = bulkManualItems.map(item => {
        const stock = item.fullItem.currentStock || 0;
        const isAvailable = stock >= 1;
        const isActive = item.barcode === activeManualAssemblyBarcode;
        const itemLocation = item.fullItem.location || item.fullItem.storageRoom || 'N/A';
        const isAddedTag = item.isAdded ? ' <small class="added-tag">[Added]</small>' : '';
        const removeBtnHTML = item.isAdded ? `<i class="fas fa-times-circle remove-item" data-barcode="${item.barcode}" title="Remove Added Item"></i>` : '';

        return `
            <li class="checkoff-list-item ${isActive ? 'active' : ''}" data-barcode="${item.barcode}">
                <div class="component-top-row">
                    <input type="checkbox" class="component-checkbox" data-barcode="${item.barcode}" ${item.isChecked ? 'checked' : ''} ${isAvailable ? '' : 'disabled'}>
                    <div class="component-details">
                        <span class="component-name">${item.name}${isAddedTag}</span>
                        <small>Barcode: ${item.barcode} | Stock: ${stock}</small>
                    </div>
                    <div class="item-quantity-control">
                        <button type="button" class="qty-btn minus-btn" data-barcode="${item.barcode}">-</button>
                        <input type="number" class="qty-input" value="${item.quantityToCheckout}" min="1" max="${stock}" data-barcode="${item.barcode}">
                        <button type="button" class="qty-btn plus-btn" data-barcode="${item.barcode}">+</button>
                    </div>
                    ${removeBtnHTML}
                </div>
                <div class="location-bar small">
                    <i class="fas fa-map-marker-alt"></i> ${itemLocation}
                </div>
            </li>`;
    }).join('');

    // --- Part 3: Build the "Removed from Kit" list if needed ---
    let removedItemsHTML = '';
    if (removedItems.length > 0) {
        removedItemsHTML = `
            <div id="removed-items-block" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-color);">
                <h5>Removed from Kit:</h5>
                <ul style="font-size: 0.9em; color: #555;">
                    ${removedItems.map(name => `<li>- ${name}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    // --- Part 4: Assemble the final HTML for the container ---
    container.innerHTML = `
        <h5>Assemble Kit Components:</h5>
        <ul class="checkoff-list">${listHTML}</ul>
        ${removedItemsHTML}
        <div class="manual-assembly-actions">
            <button type="button" class="btn visual-layout-toggle hidden" id="showSelectedComponentBtn"><i class="fas fa-eye"></i> Show Visual Location</button>
            <button type="button" class="btn btn-secondary" id="addOtherKitItemsBtn"><i class="fas fa-plus"></i> Add Other Items</button>
        </div>
        <div id="manual-visual-layout-container" class="visual-layout-container hidden"></div>
    `;
    
    // --- Part 5: Update the main notes field ---
    const notesField = document.getElementById('checkoutNotes');
    if (notesField) {
        let noteParts = [];
        if (removedItems.length > 0) noteParts.push(`Removed: ${removedItems.join(', ')}.`);
        if (addedItems.length > 0) noteParts.push(`Added: ${addedItems.join(', ')}.`);
        notesField.value = noteParts.join(' ');
    }

    // --- Part 6: Re-attach all necessary event listeners ---
    attachManualAssemblyListeners();
}


// in public/operations.js

function attachManualAssemblyListeners() {
    const container = document.getElementById('bulk-kit-details-container');
    if (!container) return;

    // Show/Hide the "Show Visual Location" button based on selection
    const visualBtn = document.getElementById('showSelectedComponentBtn');
    if (visualBtn) {
        if (activeManualAssemblyBarcode) {
            visualBtn.classList.remove('hidden');
        } else {
            visualBtn.classList.add('hidden');
        }
    }

    // --- THIS IS THE KEY FIX ---
    // The checkbox listener now calls renderManualAssemblyView() to force an immediate UI update.
    container.querySelectorAll('.component-checkbox').forEach(cb => {
        cb.addEventListener('change', e => {
            const item = bulkManualItems.find(i => i.barcode === e.target.dataset.barcode);
            if (item) {
                item.isChecked = e.target.checked;
            }
            renderManualAssemblyView(); // Re-render the entire view to show changes instantly
        });
    });
    
    // The rest of the listeners remain the same
    container.querySelectorAll('.checkoff-list-item').forEach(li => {
        li.addEventListener('click', (e) => {
            if (e.target.closest('.item-quantity-control') || e.target.matches('.component-checkbox, .remove-item')) {
                return;
            }
            activeManualAssemblyBarcode = li.dataset.barcode;
            renderManualAssemblyView();
        });
    });

    container.querySelectorAll('.qty-btn, .qty-input').forEach(el => {
        const handler = (e) => {
            const barcode = e.target.dataset.barcode;
            const item = bulkManualItems.find(i => i.barcode === barcode);
            const input = container.querySelector(`.qty-input[data-barcode="${barcode}"]`);
            if (!item || !input) return;

            let qty = parseInt(input.value, 10);
            const max = parseInt(input.max, 10);

            if (e.target.classList.contains('plus-btn')) qty++;
            else if (e.target.classList.contains('minus-btn')) qty--;
            
            if (isNaN(qty) || qty < 1) qty = 1;
            if (qty > max) qty = max;
            
            item.quantityToCheckout = qty;
            input.value = qty;
        };
        if (el.matches('.qty-btn')) el.addEventListener('click', handler);
        if (el.matches('.qty-input')) el.addEventListener('change', handler);
    });

    container.querySelectorAll('.remove-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const barcode = e.target.dataset.barcode;
            bulkManualItems = bulkManualItems.filter(i => i.barcode !== barcode);
            if (activeManualAssemblyBarcode === barcode) activeManualAssemblyBarcode = null;
            renderManualAssemblyView();
        });
    });

    document.getElementById('showSelectedComponentBtn')?.addEventListener('click', (e) => {
        const activeItemData = bulkManualItems.find(i => i.barcode === activeManualAssemblyBarcode);
        if (activeItemData && activeItemData.fullItem) {
            toggleVisualLayout([activeItemData.fullItem], e.currentTarget, 'manual-visual-layout-container');
        }
    });

    document.getElementById('addOtherKitItemsBtn')?.addEventListener('click', () => {
        const existingBarcodes = bulkManualItems.map(i => i.barcode);
        const availableItems = (window.pageDataCache.allItems || []).filter(item => 
            !existingBarcodes.includes(item.Barcode) && (item.currentStock || 0) > 0
        );
        handleListAllClick(availableItems, (selectedItem) => {
            bulkManualItems.push({
                ...selectedItem,
                barcode: selectedItem.Barcode,
                name: selectedItem.itemName,
                fullItem: selectedItem,
                isChecked: true,
                isAdded: true,
                quantityToCheckout: 1
            });
            renderManualAssemblyView();
        });
    });

    // Finally, check form completion after everything is set up
    checkFormCompletion();
}


async function handleProcessCheckout() {
    const activeTab = document.querySelector('#checkout-user-type-tabs .active').dataset.tab;
    const context = {
        assignedTo: selectedCheckoutUser || selectedBulkUser,
        program: document.getElementById('checkoutProgram').value,
        course: document.getElementById('checkoutCourse').value,
        purpose: document.getElementById('checkoutPurpose')?.value || '',
        notes: document.getElementById('checkoutNotes').value
    };
    
    let payload, confirmationMessage, apiUrl;

    if (activeTab === 'bulk' && selectedProjectKit) {
        apiUrl = '/api/processBulkCheckout';
        const numKits = document.getElementById('bulk-kit-quantity').value || 1;
        const componentsToCheckout = bulkManualItems
            .filter(i => i.isChecked)
            .map(c => ({ barcode: c.barcode, quantity: c.quantityToCheckout * numKits }));
        
        payload = {
            items: componentsToCheckout,
            context: { ...context, projectName: selectedProjectKit.itemName, numKits: numKits }
        };
        
        const componentsList = componentsToCheckout.map(c => `<li>${c.quantity}x ${c.barcode}</li>`).join('');
        confirmationMessage = `<p>Check out ${numKits} kit(s) of <strong>${selectedProjectKit.itemName}</strong> to <strong>${context.assignedTo}</strong>?</p><p>This will deduct the following components:</p><ul>${componentsList}</ul>`;

    } else {
        apiUrl = '/api/processCheckout';
        payload = {
            items: checkoutCart.map(ci => ({ item: { Barcode: ci.item.Barcode }, quantity: ci.quantity })),
            context: context
        };
        const itemsList = checkoutCart.map(ci => `<li>${ci.quantity}x ${ci.item.itemName}</li>`).join('');
        confirmationMessage = `<p>Check out the following to <strong>${context.assignedTo}</strong>?</p><ul>${itemsList}</ul>`;
    }

    showConfirmationModal('Confirm Checkout', confirmationMessage, async () => {
        const btn = document.getElementById('processCheckoutBtn');
        showSpinner(btn);
        try {
            // UPDATED: Use the new apiFetch helper
            const response = await apiFetch(apiUrl, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'An unknown error occurred during processing.');
            
            displayMessage(result.message + " Page will now refresh.", 'success', 'checkout-process-message-box');
            
            setTimeout(() => fetchOperationsPageData(), 2500);

        } catch (error) {
            console.error("Checkout failed:", error);
            displayMessage(`Error: ${error.message}`, 'error', 'checkout-process-message-box');
            hideSpinner(btn);
        }
    });
}

// in public/operations.js

// ==========================================================
// --- 5. CHECK-IN SPECIFIC FUNCTIONS ---
// ==========================================================

function renderCheckInView() {
    const { checkinData } = window.pageDataCache;
    
    const usersWithIndividualItems = (checkinData?.usersWithCheckouts || []);
    const usersWithKits = (checkinData?.usersWithKitCheckouts || []);

    const individualUserOptions = usersWithIndividualItems.map(user => `<option value="${user}">${user}</option>`).join('');
    const kitUserOptions = usersWithKits.map(user => `<option value="${user}">${user}</option>`).join('');

    return `
        <h2><i class="fas fa-arrow-down"></i> Item Check-In</h2>
        <div class="tab-navigation" id="checkin-mode-tabs">
            <button class="tab-button active" data-tab="individual"><i class="fas fa-user"></i> Individual Item</button>
            <button class="tab-button" data-tab="project"><i class="fas fa-boxes"></i> Project Kits</button>
        </div>

        <div id="individualCheckinBlock" class="content-view active">
             <div class="content-block">
                <h4>1. Select User Returning Item(s)</h4>
                <div class="form-group">
                    <select id="checkinUserSelect" class="form-control">
                        <option value="">-- Select User --</option>
                        ${individualUserOptions}
                    </select>
                </div>
            </div>
            <div id="individual-item-selection-block" class="content-block hidden"></div>
            <div id="individualItemDetails"></div>
        </div>

        <div id="projectCheckinBlock" class="content-view">
             <div class="content-block">
                <h4>1. Select User</h4>
                <div class="form-group">
                    <select id="userReturnSelect" class="form-control">
                        <option value="">-- Select User with a Kit Return --</option>
                        ${kitUserOptions}
                    </select>
                </div>
            </div>
            <div id="kitReturnSelectBlock" class="content-block hidden"></div>
            <div id="kitReturnComponentsContainer"></div>
        </div>

        <div id="checkinFinalizeBlock" class="content-block hidden">
            <h4>Notes & Finalize</h4>
            <div class="form-group">
                <label for="checkinNotes">Notes (e.g., item condition, missing parts)</label>
                <textarea id="checkinNotes" class="form-control" placeholder="Item returned in good condition."></textarea>
            </div>
            <div style="text-align:right;">
                <button type="button" id="processCheckinBtn" class="btn btn-success"><i class="fas fa-arrow-down"></i> Process Check-In</button>
            </div>
        </div>
        <div id="checkin-message-box" class="message-box" style="display: none; margin-top: 15px;"></div>
    `;
}

function attachCheckInListeners() {
    document.getElementById('checkin-mode-tabs')?.addEventListener('click', handleCheckinModeChange);
    
    // Individual listeners
    document.getElementById('checkinUserSelect')?.addEventListener('change', onUserSelectedForIndividualCheckin);

    // Project Kit listeners
    document.getElementById('userReturnSelect')?.addEventListener('change', handleUserReturnSelection);
    // --- THIS IS THE FIX ---
    // This line attaches the listener to the second dropdown in the Project Kits tab.
    document.getElementById('kitReturnSelect')?.addEventListener('change', handleKitReturnSelection);

    // Shared listener for the final button
    document.getElementById('processCheckinBtn')?.addEventListener('click', handleProcessCheckin);
}

function resetCheckinFormState() {
    checkinMode = 'individual';
    itemForCheckin = null;
    selectedUserForReturn = null;
    selectedKitForReturn = null;
}

function handleCheckinModeChange(e) {
    const target = e.target.closest('.tab-button');
    if (!target) return;

    checkinMode = target.dataset.tab;
    
    document.querySelectorAll('#checkin-mode-tabs .tab-button').forEach(btn => btn.classList.remove('active'));
    target.classList.add('active');
    
    document.getElementById('individualCheckinBlock').style.display = checkinMode === 'individual' ? 'block' : 'none';
    document.getElementById('projectCheckinBlock').style.display = checkinMode === 'project' ? 'block' : 'none';

    resetIndividualCheckinView();
    resetKitReturnView();
}

function resetIndividualCheckinView() {
    itemForCheckin = null;
    if(document.getElementById('checkinUserSelect')) document.getElementById('checkinUserSelect').value = '';
    document.getElementById('individual-item-selection-block').classList.add('hidden');
    document.getElementById('individualItemDetails').innerHTML = '';
    document.getElementById('checkinFinalizeBlock').classList.add('hidden');
}

function resetKitReturnView() {
    selectedUserForReturn = null;
    selectedKitForReturn = null;
    if(document.getElementById('userReturnSelect')) document.getElementById('userReturnSelect').value = '';
    document.getElementById('kitReturnSelectBlock').classList.add('hidden');
    document.getElementById('kitReturnComponentsContainer').innerHTML = '';
    document.getElementById('checkinFinalizeBlock').classList.add('hidden');
}

function onUserSelectedForIndividualCheckin(e) {
    const selectedUser = e.target.value;
    const itemSelectionBlock = document.getElementById('individual-item-selection-block');
    
    document.getElementById('individualItemDetails').innerHTML = '';
    document.getElementById('checkinFinalizeBlock').classList.add('hidden');

    if (!selectedUser) {
        itemSelectionBlock.classList.add('hidden');
        return;
    }
    
    const userItems = (window.pageDataCache.checkinData.individualItems || []).filter(item => item.assignedTo === selectedUser);
    
    if (userItems.length === 0) {
        displayMessage(`No individual items are checked out to ${selectedUser}.`, 'info', 'checkin-message-box');
        itemSelectionBlock.classList.add('hidden');
        return;
    }
    
    itemSelectionBlock.innerHTML = `
        <h4>2. Select Item to Check In</h4>
        <div class="item-selector-group">
             <div class="form-group" style="flex-grow:1; position:relative;">
                <input type="text" id="checkinSearchInput" class="form-control" autocomplete="off" placeholder="Search user's items...">
                <div class="autocomplete-list" id="checkinAutocompleteList"></div>
            </div>
            <button type="button" class="btn btn-secondary" id="checkinScanBtn"><i class="fas fa-qrcode"></i> Scan</button>
            <button type="button" class="btn btn-secondary" id="checkinListItemBtn"><i class="fas fa-list"></i> List Items</button>
        </div>
        <div id="selected-item-summary-container"></div>`;

    itemSelectionBlock.classList.remove('hidden');
    
    setupItemSelector('checkin', handleIndividualItemSelected, () => userItems);
    document.getElementById('checkinScanBtn').onclick = () => handleScanClick(handleIndividualItemSelected);
    document.getElementById('checkinListItemBtn').onclick = () => handleListAllClick(userItems, handleIndividualItemSelected);
}

// in public/operations.js

function handleIndividualItemSelected(item) {
    if (!item || !item.Barcode) return;
    itemForCheckin = item;
    
    document.getElementById('selected-item-summary-container').innerHTML = `
        <ul class="selected-items-list" style="margin-top: 15px;">
            <li class="active"><span class="item-name-details">${item.itemName} <small>(${item.Barcode})</small></span></li>
        </ul>`;

    const detailsContainer = document.getElementById('individualItemDetails');
    
    // --- THIS IS THE FIX ---
    // This correctly calculates the quantity checked out for THIS SPECIFIC ITEM.
   const checkedOutQty = item.transactionQuantity || 1;
    // --- END OF FIX ---
    
    const isSingleItem = checkedOutQty <= 1;

    const checkoutDetailsHtml = `
        <div class="content-block checkout-details-box" style="margin-top: 20px;">
        <h4 style="margin-top: 0;">Last Checkout Details</h4>
        <ul class="detail-list">
            <li><span class="label">Assigned To:</span> <span class="value">${item.assignedTo || 'N/A'}</span></li>
            <li><span class="label">Checked Out Qty:</span> <span class="value">${item.transactionQuantity || 'N/A'}</span></li>
            <li><span class="label">Last Checkout By:</span> <span class="value">${item.lastTransactionBy || 'N/A'}</span></li>
            <li><span class="label">Last Checkout Date:</span> <span class="value">${item.lastTransactionDate ? new Date(item.lastTransactionDate).toLocaleString() : 'N/A'}</span></li>
        </ul>
    </div>`;

    const verifyHtml = `
        <div class="content-block">
            <h4>3. Verify Quantity Returned</h4>
            <ul class="selected-items-list">
                <li class="checkin-component-item">
                    <span class="item-name-details">${item.itemName}</span>
                    <div class="item-quantity-control">
                        <button type="button" class="qty-btn minus-btn" ${isSingleItem ? 'disabled' : ''}>-</button>
                        <input type="number" class="qty-input checkin-qty-input" id="qty-checkin-individual" value="${checkedOutQty}" min="1" max="${checkedOutQty}">
                        <button type="button" class="qty-btn plus-btn" ${isSingleItem ? 'disabled' : ''}>+</button>
                    </div>
                </li>
            </ul>
            <div id="checkin-item-details-wrapper" style="margin-top: 15px;"></div>
        </div>`;
    
    detailsContainer.innerHTML = checkoutDetailsHtml + verifyHtml;
    renderSelectedItemDetails(item, 'checkin-item-details-wrapper', false);
    document.getElementById('checkinFinalizeBlock').classList.remove('hidden');

    detailsContainer.querySelector('.item-quantity-control').addEventListener('click', (e) => {
        if (!e.target.matches('.qty-btn')) return;
        const input = document.getElementById('qty-checkin-individual');
        let qty = parseInt(input.value, 10);
        const max = parseInt(input.max, 10);
        if (e.target.matches('.plus-btn')) {
            if (qty < max) qty++;
        } else {
            if (qty > 1) qty--;
        }
        input.value = qty;
    });
}

function handleUserReturnSelection(e) {
    selectedUserForReturn = e.target.value;
    const kitSelectBlock = document.getElementById('kitReturnSelectBlock');
    
    document.getElementById('kitReturnComponentsContainer').innerHTML = '';
    document.getElementById('checkinFinalizeBlock').classList.add('hidden');
    selectedKitForReturn = null;

    if (!selectedUserForReturn) {
        kitSelectBlock.classList.add('hidden');
        return;
    }

    const userKits = (window.pageDataCache.checkinData.bulkReturnData || {})[selectedUserForReturn] || [];
    if (userKits.length === 0) {
        displayMessage(`No project kits are checked out to ${selectedUserForReturn}.`, 'info', 'checkin-message-box');
        kitSelectBlock.classList.add('hidden');
        return;
    }
    
    const kitNames = userKits.map(k => `${k.kitName} (Checked out ${new Date(k.checkoutTimestamp).toLocaleDateString()})`);
    const kitValues = userKits.map(k => k.batchId);
    
    kitSelectBlock.innerHTML = `
        <h4>2. Select Project Kit to Return</h4>
        <div class="form-group">
            <select id="kitReturnSelect" class="form-control"></select>
        </div>
        <div id="selected-kit-summary-container"></div>
    `;

    populateSelect(document.getElementById('kitReturnSelect'), kitNames, "-- Select a Kit to Return --", kitValues);
    kitSelectBlock.classList.remove('hidden');
    
    document.getElementById('kitReturnSelect').addEventListener('change', handleKitReturnSelection);
}

function handleKitReturnSelection(e) {
    const batchId = e.target.value;
    const container = document.getElementById('kitReturnComponentsContainer');
    const finalizeBlock = document.getElementById('checkinFinalizeBlock');
    const summaryContainer = document.getElementById('selected-kit-summary-container');
    
    container.innerHTML = '';
    summaryContainer.innerHTML = '';
    finalizeBlock.classList.add('hidden');
    
    if (!batchId) {
        selectedKitForReturn = null;
        return;
    }

    selectedKitForReturn = (window.pageDataCache.checkinData.bulkReturnData[selectedUserForReturn] || []).find(k => k.batchId === batchId);
    if (!selectedKitForReturn) return;

    summaryContainer.innerHTML = `
        <ul class="selected-items-list" style="margin-top:15px;">
            <li class="active"><span class="item-name-details">${selectedKitForReturn.kitName} <small>(ID: ...${batchId.slice(-4)})</small></span></li>
        </ul>`;

    const checkoutDetailsHtml = `
        <div class="content-block" style="background-color: #E3F2FD; border-color: #90CAF9;">
            <h4 style="margin-top: 0; color: var(--primary-dark);">Last Checkout Details</h4>
             <ul class="detail-list">
            <li><span class="label">Assigned To:</span> <span class="value">${selectedUserForReturn || 'N/A'}</span></li>
            <li><span class="label">Kits Checked Out:</span> <span class="value">${selectedKitForReturn.numKits || 'N/A'}</span></li>
            <li><span class="label">Checkout By:</span> <span class="value">${selectedKitForReturn.checkoutUser || 'N/A'}</span></li>
            <li><span class="label">Checkout Date:</span> <span class="value">${new Date(selectedKitForReturn.checkoutTimestamp).toLocaleString()}</span></li>
        </ul>
        </div>`;

    let activeComponentBarcode = null;

    const renderComponents = () => {
        const componentsList = selectedKitForReturn.components.map(comp => {
            const checkedOutQty = comp.transactionQuantity || 1; // Use the correct quantity from the transaction
            const isActive = comp.Barcode === activeComponentBarcode ? 'active' : '';
            return `
                <li class="checkin-component-item ${isActive}" data-barcode="${comp.Barcode}">
                    <span class="item-name-details">${comp.itemName}</span>
                    <div class="item-quantity-control">
                        <button type="button" class="qty-btn minus-btn" data-barcode="${comp.Barcode}">-</button>
                        <input type="number" class="qty-input checkin-qty-input" value="${checkedOutQty}" min="0" max="${checkedOutQty}" data-barcode="${comp.Barcode}">
                        <button type="button" class="qty-btn plus-btn" data-barcode="${comp.Barcode}">+</button>
                    </div>
                </li>`;
        }).join('');

        container.innerHTML = `
            ${checkoutDetailsHtml}
            <div class="content-block">
                <h4>3. Verify Returned Components</h4>
                <p>Click an item to view its details. Adjust the quantity being returned (0 if missing).</p>
                <ul class="selected-items-list">${componentsList}</ul>
                <div id="kit-component-details-container" class="hidden" style="margin-top:20px;"></div>
            </div>`;
            
        finalizeBlock.classList.remove('hidden');

        container.querySelectorAll('.checkin-component-item').forEach(li => {
            li.addEventListener('click', (e) => {
                if (e.target.closest('.item-quantity-control')) return;

                // Remove active class from other items and add to the clicked one
                container.querySelector('.checkin-component-item.active')?.classList.remove('active');
                li.classList.add('active');

                activeComponentBarcode = li.dataset.barcode;
                const itemDetails = selectedKitForReturn.components.find(c => c.Barcode === activeComponentBarcode);
                const detailsContainer = document.getElementById('kit-component-details-container');

                if (itemDetails && detailsContainer) {
                    renderSelectedItemDetails(itemDetails, 'kit-component-details-container', false);
                    detailsContainer.classList.remove('hidden');
                }
            });
        });
        
        container.querySelectorAll('.item-quantity-control').forEach(control => {
            control.addEventListener('click', (e) => {
                if (!e.target.matches('.qty-btn')) return;
                const barcode = e.target.dataset.barcode;
                const input = container.querySelector(`.checkin-qty-input[data-barcode="${barcode}"]`);
                let qty = parseInt(input.value, 10);
                const max = parseInt(input.max, 10);
                if (e.target.matches('.plus-btn')) {
                    if (qty < max) qty++;
                } else {
                    if (qty > 0) qty--;
                }
                input.value = qty;
            });
        });
    };

    renderComponents();
}



async function handleProcessCheckin() {
    const notes = document.getElementById('checkinNotes').value;
    const activeTab = document.querySelector('#checkin-mode-tabs .active').dataset.tab;
    let payload;
    let confirmationMessage;

    if (activeTab === 'individual') {
        if (!itemForCheckin) return displayMessage('Please select an item to check in.', 'error', 'checkin-message-box');
        const quantity = parseInt(document.getElementById('qty-checkin-individual').value, 10);
        
        payload = {
            mode: 'individual',
            itemBarcode: itemForCheckin.Barcode,
            quantity: quantity,
            notes: notes,
            context: {
                assignedTo: itemForCheckin.assignedTo || '',
                program: itemForCheckin.program || '',
                course: itemForCheckin.course || '',
                purpose: itemForCheckin.purpose || ''
            }
        };
        confirmationMessage = `<p>Confirm check-in for: <strong>${quantity}x ${itemForCheckin.itemName}</strong>?</p>`;
    } else { // Project Kit Mode
        if (!selectedKitForReturn) return displayMessage('Please select a kit to return.', 'error', 'checkin-message-box');
        const returnedComponents = Array.from(document.querySelectorAll('.checkin-qty-input')).map(input => ({
            barcode: input.dataset.barcode,
            quantity: parseInt(input.value, 10)
        })).filter(c => !isNaN(c.quantity) && c.quantity > 0);

        if (returnedComponents.length === 0) return displayMessage('No components have a return quantity > 0.', 'warning', 'checkin-message-box');

        payload = {
            mode: 'project',
            components: returnedComponents,
            batchId: selectedKitForReturn.batchId,
            projectName: selectedKitForReturn.kitName,
            notes: notes
        };
        confirmationMessage = `<p>Confirm return for <strong>${selectedKitForReturn.kitName}</strong>?</p>`;
    }

    showConfirmationModal('Confirm Check-In', confirmationMessage, async () => {
        const btn = document.getElementById('processCheckinBtn');
        showSpinner(btn);
        try {
            // UPDATED: Use the new apiFetch helper
            const response = await apiFetch('/api/processCheckin', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'An unknown server error occurred.');
            
            displayMessage(result.message + " Page will refresh shortly.", 'success', 'checkin-message-box');
            setTimeout(() => fetchOperationsPageData(), 2500);

        } catch (error) {
            console.error("Check-in failed:", error);
            displayMessage(`Error: ${error.message}`, 'error', 'checkin-message-box');
            hideSpinner(btn);
        }
    });
}


// ==========================================================
// --- 6. INTRA-DEPARTMENT TRANSFER FUNCTIONS ---
// ==========================================================

// State for this view
let transferCart = [];
let activeTransferItemBarcode = null;

/**
 * Renders the HTML structure for the Intra-Department Transfer view.
 */

function renderIntradepartmentView() {
    const userRole = "Admin"; 
    if (userRole !== 'Admin' && userRole !== 'Master Admin') {
        return `<h2><i class="fas fa-lock"></i> Access Denied</h2><p>You do not have permission to perform this operation.</p>`;
    }

    const departmentOptions = (window.pageDataCache.dropdowns?.Departments || []).map(d => `<option value="${d}">${d}</option>`).join('');
    const staffOptions = (window.pageDataCache.staffList || []).map(p => `<option value="${p.name} (${p.email})">${p.name} (${p.email})</option>`).join('');
    const purposeOptions = (window.pageDataCache.dropdowns?.Purpose || []).map(p => `<option value="${p}">${p}</option>`).join('');

    return `
        <h2><i class="fas fa-exchange-alt"></i> Intra-Department Transfer</h2>
        <div id="transfer-message-box" class="message-box"></div>

        <div class="content-block">
            <h4>1. Select Item(s) to Transfer</h4>
            <div class="item-selector-group">
                <div class="form-group" style="flex-grow:1; position:relative;">
                    <input type="text" id="transferSearchInput" class="form-control" autocomplete="off" placeholder="Search available items...">
                    <div class="autocomplete-list" id="transferAutocompleteList"></div>
                </div>
                <button type="button" class="btn btn-secondary" id="transferScanBtn"><i class="fas fa-qrcode"></i> Scan</button>
                <button type="button" class="btn btn-secondary" id="transferListItemBtn"><i class="fas fa-list"></i> List All</button>
            </div>
            <h4 style="margin-top: 20px;">Items to Transfer</h4>
            <ul id="transfer-cart-list" class="selected-items-list"><li class="placeholder">No items selected.</li></ul>
            <button type="button" id="addAnotherTransferItemBtn" class="btn btn-secondary hidden" style="margin-top:10px;"><i class="fas fa-plus"></i> Add Another Item</button>
        </div>

        <div id="transfer-item-details-wrapper" class="content-block hidden"></div>

        <div id="transfer-details-block" class="content-block hidden">
            <h4>2. Transfer Details</h4>
            <div class="form-grid">
                <div class="form-group">
                    <label for="fromDepartment">From Department</label>
                    <select id="fromDepartment" class="form-control" disabled><option value="">-- Auto-populated --</option>${departmentOptions}</select>
                </div>
                <div id="to-dept-group" class="form-group hidden">
                    <label for="toDepartment">To Department</label>
                    <select id="toDepartment" class="form-control"><option value="">-- Select Destination --</option>${departmentOptions}</select>
                </div>
                <div id="new-storage-room-group" class="form-group hidden">
                    <label for="newStorageRoom">New Storage Room</label>
                    <input type="text" id="newStorageRoom" class="form-control" placeholder="e.g., Main Storeroom">
                </div>
                <div id="new-location-group" class="form-group hidden">
                    <label for="newLocation">New Location</label>
                    <input type="text" id="newLocation" class="form-control" placeholder="e.g., Zone D - Shelf 1">
                </div>
                <div id="sending-staff-group" class="form-group hidden">
                    <label for="sendingStaff">Sending Staff Member</label>
                    <select id="sendingStaff" class="form-control"><option value="">-- Select Staff --</option>${staffOptions}</select>
                </div>
                <div id="receiving-staff-group" class="form-group hidden">
                    <label for="receivingStaff">Receiving Staff Member (Optional)</label>
                    <select id="receivingStaff" class="form-control"><option value="">-- Select Staff --</option>${staffOptions}</select>
                </div>
                <div id="transfer-purpose-group" class="form-group hidden">
                    <label for="transferPurpose">Purpose</label>
                    <select id="transferPurpose" class="form-control"><option value="">-- Select Purpose --</option>${purposeOptions}</select>
                </div>
            </div>
            <div class="form-group" style="margin-top: 20px;">
                <label for="transferNotes">Notes (Optional)</label>
                <textarea id="transferNotes" class="form-control" placeholder="Reason for transfer..."></textarea>
            </div>
            <div style="text-align:right;">
                <button type="button" id="processTransferBtn" class="btn btn-success" disabled><i class="fas fa-exchange-alt"></i> Process Transfer</button>
            </div>
        </div>
        <div id="transfer-process-message-box" class="message-box" style="display: none; margin-top: 15px;"></div>
    `;
}

/**
 * Attaches event listeners for the Intra-Department Transfer view.
 */
function attachIntradepartmentListeners() {
    const view = document.getElementById('view-Intradepartment');
    if (!view) return;

    transferCart = [];
    activeTransferItemBarcode = null;
    
    const allItemsInStock = (window.pageDataCache.allItems || []).filter(item => (item.currentStock || 0) > 0);
    setupItemSelector('transfer', handleAddItemToTransferCart, () => allItemsInStock);

    view.querySelector('#transferScanBtn')?.addEventListener('click', () => handleScanClick(handleAddItemToTransferCart));
    view.querySelector('#transferListItemBtn')?.addEventListener('click', () => handleListAllClick(allItemsInStock, handleAddItemToTransferCart));
    
    view.querySelector('#addAnotherTransferItemBtn')?.addEventListener('click', () => {
        const cartBarcodes = transferCart.map(ci => ci.item.Barcode);
        const availableItems = (window.pageDataCache.allItems || [])
            .filter(item => (item.currentStock || 0) > 0 && !cartBarcodes.includes(item.Barcode));
        handleListAllClick(availableItems, handleAddItemToTransferCart);
    });
    
    view.querySelector('#transfer-details-block')?.addEventListener('input', checkTransferFormCompletion);
    view.querySelector('#transfer-details-block')?.addEventListener('change', checkTransferFormCompletion);
    view.querySelector('#processTransferBtn')?.addEventListener('click', handleProcessIntradepartmentTransfer);
}

/**
 * Adds an item to the transfer cart and updates the UI.
 */
function handleAddItemToTransferCart(item) {
    if (transferCart.some(ci => ci.item.Barcode === item.Barcode)) {
        displayMessage("Item is already in the transfer list.", 'info', 'transfer-message-box');
        return;
    }
    const fromDeptEl = document.getElementById('fromDepartment');
    if (transferCart.length === 0) {
        fromDeptEl.value = item.currentDepartment || '';
    } else {
        if (item.currentDepartment !== fromDeptEl.value) {
            displayMessage(`All items for a single transfer must come from the same department (${fromDeptEl.value}).`, 'error', 'transfer-message-box');
            return;
        }
    }
    transferCart.push({ item: item, quantity: 1 });
    activeTransferItemBarcode = item.Barcode;
    renderTransferCart();
}

/**
 * Renders the list of items in the transfer cart.
 */

function renderTransferCart() {
    const list = document.getElementById('transfer-cart-list');
    const addAnotherBtn = document.getElementById('addAnotherTransferItemBtn');
    if (!list || !addAnotherBtn) return;

    if (transferCart.length === 0) {
        list.innerHTML = `<li class="placeholder">No items selected.</li>`;
        document.getElementById('transfer-details-block').classList.add('hidden');
        document.getElementById('transfer-item-details-wrapper').classList.add('hidden');
        addAnotherBtn.classList.add('hidden');
        return;
    }
    
    addAnotherBtn.classList.remove('hidden');
    document.getElementById('transfer-details-block').classList.remove('hidden');

    list.innerHTML = transferCart.map(cartItem => {
        const item = cartItem.item;
        const isActive = item.Barcode === activeTransferItemBarcode ? 'active' : '';
        return `
            <li class="${isActive}" data-barcode="${item.Barcode}">
                <div class="item-name-details">${item.itemName} <small>(${item.Barcode})</small></div>
                <div class="item-quantity-control">
                    <button type="button" class="qty-btn minus-btn" data-barcode="${item.Barcode}">-</button>
                    <input type="number" class="qty-input" value="${cartItem.quantity}" min="1" max="${item.currentStock || 1}" data-barcode="${item.Barcode}">
                    <button type="button" class="qty-btn plus-btn" data-barcode="${item.Barcode}">+</button>
                </div>
                <i class="fas fa-times-circle remove-item" data-barcode="${item.Barcode}"></i>
            </li>
        `;
    }).join('');

    list.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', e => {
            if (e.target.closest('.item-quantity-control, .remove-item')) return;
            activeTransferItemBarcode = li.dataset.barcode;
            renderTransferCart();
        });
    });

    list.querySelectorAll('.qty-btn, .qty-input').forEach(el => {
        const handler = e => {
            const barcode = e.target.closest('li').dataset.barcode;
            const cartItem = transferCart.find(ci => ci.item.Barcode === barcode);
            if (!cartItem) return;
            const input = list.querySelector(`input[data-barcode="${barcode}"]`);
            let qty = parseInt(input.value, 10);
            if (e.target.matches('.plus-btn')) qty++;
            else if (e.target.matches('.minus-btn')) qty--;
            else qty = isNaN(qty) ? 1 : qty;
            if (qty < 1) qty = 1;
            if (qty > cartItem.item.currentStock) qty = cartItem.item.currentStock;
            cartItem.quantity = qty;
            input.value = qty;
            checkTransferFormCompletion();
        };
        if(el.matches('.qty-btn')) el.addEventListener('click', handler);
        if(el.matches('.qty-input')) el.addEventListener('change', handler);
    });

    list.querySelectorAll('.remove-item').forEach(btn => {
        btn.addEventListener('click', e => {
            const barcode = e.currentTarget.dataset.barcode;
            transferCart = transferCart.filter(ci => ci.item.Barcode !== barcode);
            if (activeTransferItemBarcode === barcode) {
                activeTransferItemBarcode = transferCart.length > 0 ? transferCart[0].item.Barcode : null;
            }
            if (transferCart.length === 0) {
                document.getElementById('fromDepartment').value = '';
            }
            renderTransferCart();
        });
    });
    
    const activeItem = transferCart.find(ci => ci.item.Barcode === activeTransferItemBarcode)?.item;
    if (activeItem) {
        renderSelectedItemDetails(activeItem, 'transfer-item-details-wrapper');
    } else {
        document.getElementById('transfer-item-details-wrapper').classList.add('hidden');
    }
    checkTransferFormCompletion();
}


/**
 * Checks if all required fields are filled to enable the submit button.
 */

function checkTransferFormCompletion() {
    // --- Cascading Logic ---
    const fromDept = document.getElementById('fromDepartment').value;
    const toDeptEl = document.getElementById('toDepartment');
    const toDeptGroup = document.getElementById('to-dept-group');
    if (fromDept) toDeptGroup?.classList.remove('hidden');

    const toDept = toDeptEl.value;
    const newRoomGroup = document.getElementById('new-storage-room-group');
    const newLocGroup = document.getElementById('new-location-group');
    if (toDept && fromDept !== toDept) {
        newRoomGroup?.classList.remove('hidden');
        newLocGroup?.classList.remove('hidden');
    }

    const newLoc = document.getElementById('newLocation').value;
    const sendingStaffGroup = document.getElementById('sending-staff-group');
    if (newLoc) sendingStaffGroup?.classList.remove('hidden');

    const sendingStaff = document.getElementById('sendingStaff').value;
    const receivingStaffGroup = document.getElementById('receiving-staff-group');
    if (sendingStaff) receivingStaffGroup?.classList.remove('hidden');
    
    const purposeGroup = document.getElementById('transfer-purpose-group');
    if (sendingStaff) purposeGroup?.classList.remove('hidden');

    // --- Button Enable/Disable Logic ---
    const purpose = document.getElementById('transferPurpose').value;
    const processBtn = document.getElementById('processTransferBtn');
    const isComplete = transferCart.length > 0 && fromDept && toDept && newLoc && sendingStaff && purpose && (fromDept !== toDept);
    
    if(processBtn) processBtn.disabled = !isComplete;
}


/**
 * Gathers and sends the transfer data to the backend.
 */
async function handleProcessIntradepartmentTransfer() {
    const payload = {
        items: transferCart.map(ci => ({ barcode: ci.item.Barcode, itemName: ci.item.itemName, quantity: ci.quantity })),
        fromDept: document.getElementById('fromDepartment').value,
        toDept: document.getElementById('toDepartment').value,
        newStorageRoom: document.getElementById('newStorageRoom').value,
        newLocation: document.getElementById('newLocation').value,
        sendingStaff: document.getElementById('sendingStaff').value,
        receivingStaff: document.getElementById('receivingStaff').value,
        purpose: document.getElementById('transferPurpose').value,
        notes: document.getElementById('transferNotes').value
    };

    const confirmationMessage = `
        <p>You are about to transfer ${payload.items.length} item type(s) from <strong>${payload.fromDept}</strong> to <strong>${payload.toDept}</strong>.</p>
        <p>Please confirm.</p>
    `;
    
    showConfirmationModal('Confirm Transfer', confirmationMessage, async () => {
        const btn = document.getElementById('processTransferBtn');
        showSpinner(btn);
        try {
            // UPDATED: Use the new apiFetch helper
            const response = await apiFetch('/api/processIntradepartmentTransfer', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            displayMessage(result.message + " Page will refresh shortly.", 'success', 'transfer-process-message-box');
            setTimeout(() => fetchOperationsPageData(), 2500);

        } catch (error) {
            displayMessage(`Error: ${error.message}`, 'error', 'transfer-process-message-box');
            hideSpinner(btn);
        }
    });
}


// ==========================================================
// --- 7. LOST / DAMAGED FUNCTIONS ---
// ==========================================================

// State for this view
let lostDamageCart = [];
let activeLostDamageItemBarcode = null;

/**
 * Renders the HTML structure for the Lost / Damaged view.
 */

function renderLostDamageView() {
    const userRole = "Admin"; 
    if (userRole !== 'Admin' && userRole !== 'Master Admin') {
        return `<h2><i class="fas fa-lock"></i> Access Denied</h2><p>You do not have permission to perform this operation.</p>`;
    }
    
    // Combine users from both individual and kit checkouts for a complete list.
    const individualUsers = window.pageDataCache.checkinData?.usersWithCheckouts || [];
    const kitUsers = window.pageDataCache.checkinData?.usersWithKitCheckouts || [];
    const allUsersWithItems = [...new Set([...individualUsers, ...kitUsers])].sort();

    const userOptions = allUsersWithItems.map(u => `<option value="${u}">${u}</option>`).join('');

    return `
        <h2><i class="fas fa-heart-crack"></i> Log Lost or Damaged Item</h2>
        <div id="lost-damage-message-box" class="message-box"></div>

        <div class="content-block">
            <h4>1. Select User Associated with Incident</h4>
            <div class="form-group">
                <select id="lostDamageUserSelect" class="form-control">
                    <option value="">-- Select User --</option>
                    ${userOptions}
                </select>
            </div>
        </div>

        <div id="lost-damage-item-selection-block" class="content-block hidden">
            <h4>2. Select Item(s)</h4>
            <div class="item-selector-group">
                <div class="form-group" style="flex-grow:1; position:relative;">
                    <input type="text" id="lostDamageSearchInput" class="form-control" autocomplete="off" placeholder="Search user's items...">
                    <div class="autocomplete-list" id="lostDamageAutocompleteList"></div>
                </div>
                <button type="button" class="btn btn-secondary" id="lostDamageScanBtn"><i class="fas fa-qrcode"></i> Scan</button>
                <button type="button" class="btn btn-secondary" id="lostDamageListItemBtn"><i class="fas fa-list"></i> List User's Items</button>
            </div>
            <h4 style="margin-top: 20px;">Items to Log:</h4>
            <ul id="lost-damage-cart-list" class="selected-items-list"><li class="placeholder">No items selected.</li></ul>
        </div>

        <div id="lost-damage-item-details-wrapper" class="content-block hidden"></div>

        <div id="incident-details-block" class="content-block hidden">
            <h4>3. Incident Details</h4>
            <div class="form-grid">
                <div class="form-group">
                    <label for="incidentType">Incident Type</label>
                    <select id="incidentType" class="form-control">
                        <option value="Lost">Lost</option>
                        <option value="Damaged">Damaged</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label for="incidentNotes">Notes (Required)</label>
                <textarea id="incidentNotes" class="form-control" required placeholder="Describe the incident..."></textarea>
            </div>
            <div style="text-align:right;">
                <button type="button" id="processIncidentBtn" class="btn btn-danger"><i class="fas fa-exclamation-triangle"></i> Log Incident</button>
            </div>
        </div>
        <div id="incident-process-message-box" class="message-box" style="display: none; margin-top: 15px;"></div>
    `;
}

/**
 * Attaches event listeners for the Lost / Damaged view.
 */
function attachLostDamageListeners() {
    lostDamageCart = [];
    activeLostDamageItemBarcode = null;

    const view = document.getElementById('view-LostDamage');
    if (!view) return;

    view.querySelector('#lostDamageUserSelect')?.addEventListener('change', onUserSelectedForIncident);
    view.querySelector('#processIncidentBtn')?.addEventListener('click', handleProcessIncident);
}

/**
 * Handles the selection of a user from the dropdown.
 */
function onUserSelectedForIncident(e) {
    const selectedUser = e.target.value;
    const itemSelectionBlock = document.getElementById('lost-damage-item-selection-block');
    
    lostDamageCart = [];
    renderLostDamageCart();

    if (!selectedUser) {
        itemSelectionBlock.classList.add('hidden');
        return;
    }

    // Get items from both individual checkouts and the components of all kits checked out to the user.
    const individualItems = (window.pageDataCache.checkinData.individualItems || []).filter(item => item.assignedTo === selectedUser);
    
    const kitComponents = [];
    const userKits = window.pageDataCache.checkinData.bulkReturnData?.[selectedUser] || [];
    userKits.forEach(kit => {
        kit.components.forEach(comp => kitComponents.push(comp));
    });

    const userItems = [...individualItems, ...kitComponents];

    if (userItems.length === 0) {
        displayMessage(`No items are currently checked out to ${selectedUser}.`, 'info', 'lost-damage-message-box');
        itemSelectionBlock.classList.add('hidden');
        return;
    }
    
    itemSelectionBlock.classList.remove('hidden');
    
    setupItemSelector('lostDamage', handleAddItemToLostDamageCart, () => userItems);
    document.getElementById('lostDamageScanBtn').onclick = () => handleScanClick(handleAddItemToLostDamageCart);
    document.getElementById('lostDamageListItemBtn').onclick = () => handleListAllClick(userItems, handleAddItemToLostDamageCart);
}

/**
 * Adds an item to the cart for logging.
 */
function handleAddItemToLostDamageCart(item) {
    if (lostDamageCart.some(ci => ci.item.Barcode === item.Barcode)) {
        displayMessage("Item is already in the list.", 'info', 'lost-damage-message-box');
        return;
    }

    const qtyCheckedOut = item.transactionQuantity || 1;
    lostDamageCart.push({ item: item, quantity: 1, maxQuantity: qtyCheckedOut });
    activeLostDamageItemBarcode = item.Barcode;
    renderLostDamageCart();
}

/**
 * Renders the list of items to be logged and shows the final form.
 */
function renderLostDamageCart() {
    const list = document.getElementById('lost-damage-cart-list');
    if (!list) return;

    const detailsWrapper = document.getElementById('lost-damage-item-details-wrapper');
    const incidentBlock = document.getElementById('incident-details-block');

    if (lostDamageCart.length === 0) {
        list.innerHTML = `<li class="placeholder">No items selected.</li>`;
        detailsWrapper.classList.add('hidden');
        incidentBlock.classList.add('hidden');
        return;
    }

    list.innerHTML = lostDamageCart.map(cartItem => {
        const item = cartItem.item;
        const isActive = item.Barcode === activeLostDamageItemBarcode ? 'active' : '';
        return `
            <li class="${isActive}" data-barcode="${item.Barcode}">
                <div class="item-name-details">${item.itemName} <small>(${item.Barcode})</small></div>
                <div class="item-quantity-control">
                    <button type="button" class="qty-btn minus-btn" data-barcode="${item.Barcode}">-</button>
                    <input type="number" class="qty-input" value="${cartItem.quantity}" min="1" max="${cartItem.maxQuantity}" data-barcode="${item.Barcode}">
                    <button type="button" class="qty-btn plus-btn" data-barcode="${item.Barcode}">+</button>
                </div>
                <i class="fas fa-times-circle remove-item" data-barcode="${item.Barcode}"></i>
            </li>
        `;
    }).join('');

    // Attach listeners for cart interaction
    list.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', e => {
            if (e.target.closest('.item-quantity-control, .remove-item')) return;
            activeLostDamageItemBarcode = li.dataset.barcode;
            renderLostDamageCart();
        });
    });

    list.querySelectorAll('.remove-item').forEach(btn => {
        btn.addEventListener('click', () => {
            lostDamageCart = lostDamageCart.filter(ci => ci.item.Barcode !== btn.dataset.barcode);
            if(activeLostDamageItemBarcode === btn.dataset.barcode) activeLostDamageItemBarcode = null;
            renderLostDamageCart();
        });
    });

    list.querySelectorAll('.qty-btn, .qty-input').forEach(el => {
        const handler = e => {
            const barcode = e.target.closest('li').dataset.barcode;
            const cartItem = lostDamageCart.find(ci => ci.item.Barcode === barcode);
            if (!cartItem) return;
            const input = list.querySelector(`input[data-barcode="${barcode}"]`);
            let qty = parseInt(input.value, 10);
            if (e.target.matches('.plus-btn')) qty++;
            else if (e.target.matches('.minus-btn')) qty--;
            else qty = isNaN(qty) ? 1 : qty;
            if (qty < 1) qty = 1;
            if (qty > cartItem.maxQuantity) qty = cartItem.maxQuantity;
            cartItem.quantity = qty;
            input.value = qty;
        };
        if(el.matches('.qty-btn')) el.addEventListener('click', handler);
        if(el.matches('.qty-input')) el.addEventListener('change', handler);
    });

    const activeItem = lostDamageCart.find(ci => ci.item.Barcode === activeLostDamageItemBarcode)?.item;
    if (activeItem) {
        renderSelectedItemDetails(activeItem, 'lost-damage-item-details-wrapper');
    } else {
        detailsWrapper.classList.add('hidden');
    }

    incidentBlock.classList.remove('hidden');
}

/**
 * Gathers data and sends it to the server to log the incident.
 */
function handleProcessIncident() {
    const incidentNotes = document.getElementById('incidentNotes').value;
    if (lostDamageCart.length === 0) {
        return displayMessage('Please select an item to log.', 'error', 'incident-process-message-box');
    }
    if (!incidentNotes.trim()) {
        return displayMessage('Notes are required to describe the incident.', 'error', 'incident-process-message-box');
    }

    const payload = {
        items: lostDamageCart.map(ci => ({ item: ci.item, quantity: ci.quantity })),
        type: document.getElementById('incidentType').value,
        notes: incidentNotes,
        user: firebase.auth().currentUser.email // Add user email to payload
    };

    const confirmationMessage = `<p>You are about to log ${payload.items.length} item type(s) as <strong>${payload.type}</strong>. This action will permanently adjust inventory stock and cannot be undone. Please confirm.</p>`;

    showConfirmationModal('Confirm Incident Report', confirmationMessage, async () => {
        const btn = document.getElementById('processIncidentBtn');
        showSpinner(btn);
        try {
            // UPDATED: Use the new apiFetch helper
            const response = await apiFetch('/api/logLostOrDamagedItem', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            displayMessage(result.message + " Page will refresh shortly.", 'success', 'incident-process-message-box');
            setTimeout(() => fetchOperationsPageData(), 2500);

        } catch (error) {
            displayMessage(`Error: ${error.message}`, 'error', 'incident-process-message-box');
            hideSpinner(btn);
        }
    });
}