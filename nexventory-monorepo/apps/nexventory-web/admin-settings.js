// --- 1. PAGE-SPECIFIC STATE & CACHE ---
let settingsCache = {};
let activeView = 'UserManagement';
let activeUserManagementTab = 'pending';
let activeDatabaseTab = 'staff'; // Default to staff tab
let currentlyEditingDept = null; // Tracks which department is in "edit mode"

let unsavedChanges = {
    permissions: false,
    userDatabases: false,
    departmentMappings: false,
};


const ALL_PERMISSIONS = {

   // --- Inventory Hub Permissions ---
    canManageInventory: { text: "Add, Edit & Bulk Import Items", icon: "fa-box-open" },
    canBuildKits: { text: "Create & Manage Project Kits", icon: "fa-sitemap" },
    canManageLocations: { text: "Use the Location Manager", icon: "fa-map-signs" },
    canManageOrderRequests: { text: "Approve/Deny Order Requests", icon: "fa-shopping-cart" },
    canGenerateLabels: { text: "Generate Asset Labels", icon: "fa-tags" },

    // --- App & User Settings Permissions ---
    canManageUsers: { text: "Manage Users, Roles & Permissions", icon: "fa-users-cog" },
    canManageDatabases: { text: "Manage Staff & Student Databases", icon: "fa-database" },
    canManageDepartments: { text: "Manage Department Mappings", icon: "fa-building" },
    canExportData: { text: "View & Export System Data", icon: "fa-file-excel" },

    // --- Operations Page Permissions (from the original list) ---
    canTransfer: { text: "Perform Intra-Department Transfers", icon: "fa-exchange-alt" },
    canLogDamaged: { text: "Log 'Damaged' Items", icon: "fa-heart-crack" },
    canLogLost: { text: "Log 'Lost' Items", icon: "fa-bomb" },
    canEditItems: { text: "Edit Inventory Item Details", icon: "fa-edit" },
    canBuildKits: { text: "Build Project Kits", icon: "fa-sitemap" }
};

// --- 2. INITIALIZATION ---
function onAuthReady(user) {
    const adminContainer = document.getElementById('admin-container');
    const adminLoader = document.getElementById('admin-loader');

    if (user) {
        // --- ADD THIS SECURITY CHECK ---
        const userRole = window.sessionInfo?.role;
        if (userRole === 'Admin' || userRole === 'Master Admin') {
            fetchAdminSettingsData();
        } else {
            // If the user is not an admin, show a permission denied message.
            if (adminLoader) adminLoader.innerHTML = `<div class="content-block" style="text-align:center;"><h2>Permission Denied</h2><p>You do not have the required permissions to access this page.</p></div>`;
            hideAppPreloader();
        }
        // --- END OF SECURITY CHECK ---
    } else {
        if (adminLoader) adminLoader.innerHTML = `<div class="content-block" style="text-align:center;"><h2>Please Sign In</h2><p>Admin settings require authentication.</p></div>`;
        hideAppPreloader();
    }
}

async function fetchAdminSettingsData() {
    const adminLoader = document.getElementById('admin-loader');
    const adminContainer = document.getElementById('admin-container');
    try {
        adminLoader.style.display = 'flex';
        adminContainer.style.display = 'none';

        // UPDATED: Use apiFetch to automatically send auth token and orgId
        const response = await apiFetch('/api/getAdminSettingsData', {
            method: 'POST', // Use POST since apiFetch sends a body
            body: JSON.stringify({})
        });
        if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
        
        settingsCache = await response.json();

        adminLoader.style.display = 'none';
        adminContainer.style.display = 'block';
        
        // Pass the fetched role and permissions to the sidebar renderer
        renderSidebar(settingsCache.userRole, settingsCache.userPermissions);
        renderContent();
    } catch (error) {
        console.error("Could not fetch admin settings:", error);
        adminLoader.innerHTML = `<div class="message-box error">Failed to load admin settings.</div>`;
    } finally {
        hideAppPreloader();
    }
}

// --- 3. UI RENDERING & CORE LOGIC ---

function renderSidebar(userRole, userPermissions = {}) {
    // The sidebar is now rendered by script.js. This function's new role
    // is to attach the event listeners needed for this page to work.
    attachPrimaryEventListeners();
}

function renderContent() {
    const contentPanel = document.getElementById('content-panel');
    if (!contentPanel) return;

    // Highlight the active link in the sidebar
    document.querySelectorAll('#app-sidebar .nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.view === activeView);
    });

    // Update page title based on active view
    const pageTitle = document.getElementById('admin-page-title');
    const pageSubtitle = document.getElementById('admin-page-subtitle');
    const activeLinkText = document.querySelector(`#app-sidebar .nav-link[data-view="${activeView}"] .link-text`)?.textContent;
    
    if (pageTitle && activeLinkText) {
        pageTitle.textContent = activeLinkText;
        // You can add subtitles for each section here if you wish
        pageSubtitle.textContent = `Manage ${activeLinkText.toLowerCase()}.`;
    }

    let html = '';
    switch (activeView) {
        case 'UserManagement': html = renderUserManagementView(); break;
        case 'UserDatabases': html = renderUserDatabasesView(); break;
        case 'DepartmentMappings': html = renderDepartmentMappingsView(); break;
        case 'SystemTools': html = renderSystemToolsView(); break;
        case 'DataReporting': html = renderDataReportingView(); break;
        default: html = `<h3>${activeView}</h3><p>This section is not recognized.</p>`;
    }
    contentPanel.innerHTML = html;

    // Attach the correct event listeners for the rendered content
    if (activeView === 'UserManagement') attachUserManagementListeners();
    else if (activeView === 'UserDatabases') attachUserDatabasesListeners();
    else if (activeView === 'SystemTools') attachSystemToolsListeners();
    else if (activeView === 'DepartmentMappings') attachDepartmentMappingsListeners();
    else if (activeView === 'DataReporting') attachDataReportingListeners();
    
    updateSaveButtonVisibility();
}

function attachPrimaryEventListeners() {
    // This is the new main controller, listening for clicks on the sidebar
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) {
        sidebar.addEventListener('click', (e) => {
            const link = e.target.closest('.nav-link');
            if (link && link.dataset.view) {
                e.preventDefault();
                activeView = link.dataset.view;
                // Reset sub-tabs when switching main views
                if (activeView === 'UserManagement') {
                    activeUserManagementTab = 'pending';
                }
                renderContent();
            }
        });
    }
    
    const saveBtn = document.getElementById('saveAllBtn');
    if(saveBtn) {
        saveBtn.addEventListener('click', handleSaveAllSettings);
    }
}


// --- 4. USER MANAGEMENT SPECIFIC FUNCTIONS ---
function renderUserManagementView() {
    const pendingCount = settingsCache.pendingUsers?.length || 0;
    const notificationBadge = pendingCount > 0 ? `<span class="notification-badge-tab">${pendingCount}</span>` : '';

    return `
        <h3>User Role Management</h3>
        <p>Manage user requests, roles, and permissions.</p>
        <div class="content-tab-navigation">
            <button class="content-tab-button ${activeUserManagementTab === 'pending' ? 'active' : ''}" data-tab="pending">Pending Requests ${notificationBadge}</button>
            <button class="content-tab-button ${activeUserManagementTab === 'manage' ? 'active' : ''}" data-tab="manage">Manage Users</button>
            <button class="content-tab-button ${activeUserManagementTab === 'permissions' ? 'active' : ''}" data-tab="permissions">Permissions</button>
        </div>
        <div id="tab-pending" class="content-tab ${activeUserManagementTab === 'pending' ? 'active' : ''}"></div>
        <div id="tab-manage" class="content-tab ${activeUserManagementTab === 'manage' ? 'active' : ''}"></div>
        <div id="tab-permissions" class="content-tab ${activeUserManagementTab === 'permissions' ? 'active' : ''}"></div>
    `;
}

function attachUserManagementListeners() {
    document.querySelectorAll('.content-tab-button').forEach(button => {
        button.addEventListener('click', () => {
            activeUserManagementTab = button.dataset.tab;
            renderContent();
        });
    });

    if (activeUserManagementTab === 'pending') {
        document.getElementById('tab-pending').innerHTML = renderPendingRequests();
        attachPendingRequestListeners();
    } else if (activeUserManagementTab === 'manage') {
        document.getElementById('tab-manage').innerHTML = renderManageUsersContent();
        attachManageUsersListeners();
    } else if (activeUserManagementTab === 'permissions') {
        document.getElementById('tab-permissions').innerHTML = renderPermissionsContent();
        attachPermissionsListeners();
    }

    // Attach the listener for the main save button
    const saveBtn = document.getElementById('saveAllBtn');
    if(saveBtn) {
        saveBtn.addEventListener('click', handleSaveAllSettings);
    }
}

function renderPendingRequests() {
    const pending = settingsCache.pendingUsers || [];
    // Get a list of department options for the dropdown
    const departmentOptions = (settingsCache.dropdowns?.Departments || [])
        .map(d => `<option value="${d}">${d}</option>`)
        .join('');

    let html = `<h4><i class="fas fa-clock"></i> Pending Requests (${pending.length})</h4>`;
    if (pending.length === 0) {
        html += `<p>There are no pending user requests.</p>`;
    } else {
        html += `<ul class="user-list">`;
        html += pending.map(user => {
            // FIX: Unique IDs for the dropdowns for each user
            const safeEmailId = user.email.replace(/[^a-zA-Z0-9]/g, "");
            return `
            <li class="user-list-item">
                <div class="user-info">
                    <span class="user-email">${user.email}</span>
                    <span class="user-role">Requested Dept: <strong>${user.requestedDepartment || 'N/A'}</strong></span>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <select class="form-control" id="role-for-${safeEmailId}">
                        <option value="Standard">Standard</option>
                        <option value="Sub-admin">Sub-admin</option>
                        <option value="Admin">Admin</option>
                    </select>
                    
                    <select class="form-control" id="dept-for-${safeEmailId}">
                        <option value="">-- Assign Dept --</option>
                        ${departmentOptions}
                    </select>

                    <button class="btn btn-success btn-sm approve-btn" data-email="${user.email}">Approve</button>
                    <button class="btn btn-danger btn-sm deny-btn" data-email="${user.email}">Deny</button>
                </div>
            </li>`
        }).join('');
        html += `</ul>`;
    }
    return html;
}

function renderManageUsersContent() {
    return `
        <div class="user-management-grid">
            <div class="tool-card">
                <h4><i class="fas fa-user-plus"></i> Add or Update User</h4>
                <p>Add existing staff/students who do not require approval.</p>
                <div class="form-group"><label for="newUserEmail">User Email</label><input type="email" id="newUserEmail" class="form-control" placeholder="user@example.com" required></div>
                <div class="form-group"><label for="newUserRole">Assign Role</label>
                    <select id="newUserRole" class="form-control">
                        <option value="Standard">Standard</option>
                        <option value="Sub-admin">Sub-admin</option>
                        <option value="Admin">Admin</option>
                        <option value="Master Admin">Master Admin</option>
                    </select>
                </div>
                <button id="addUserBtn" class="btn btn-success"><i class="fas fa-plus-circle"></i> Add / Update User</button>
            </div>
            <div class="tool-card">
                <h4><i class="fas fa-users"></i> Current Users</h4>
                <p>Click on a user to manage their permission overrides.</p>
                <div id="user-list-container"></div>
            </div>
        </div>`;
}

function renderPermissionsContent() {
    return `
        <h4><i class="fas fa-shield-alt"></i> Role Permissions</h4>
        <p>Define what each user role is allowed to do. These settings will apply globally, but can be overridden for specific users in the "Manage Users" tab.</p>
        <div class="form-group">
            <label for="role-selector">Select Role to Edit:</label>
            <select id="role-selector" class="form-control" style="max-width: 300px;">
                <option value="Sub-admin">Sub-admin</option>
                <option value="Admin">Admin</option>
                <option value="Standard">Standard</option>
            </select>
        </div>
        <div id="permissions-editor-container"></div>`;
}

function renderUserList() {
    const container = document.getElementById('user-list-container');
    if (!container) return;
    const userRoles = settingsCache.userRoles || [];
    const userListHTML = userRoles.length > 0 ? userRoles.sort((a, b) => a.email.localeCompare(b.email)).map(user => `
        <li class="user-list-item" data-email="${user.email}" title="Click to edit overrides">
            <div class="user-info">
                <span class="user-email">${user.email}</span>
                <span class="user-role">${user.role}</span>
            </div>
            ${user.role !== 'Master Admin' ? `<button class="delete-btn" data-email="${user.email}" title="Remove User">&times;</button>` : ''}
        </li>`).join('') : '<li class="user-list-item" style="justify-content: center;">No approved users found.</li>';
    container.innerHTML = `<ul class="user-list">${userListHTML}</ul>`;
    container.querySelectorAll('.user-list-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.matches('.delete-btn')) {
                e.stopPropagation();
                handleDeleteUser(item.dataset.email);
            } else {
                handleUserClick(item.dataset.email);
            }
        });
    });
}

function attachPendingRequestListeners() {
    const container = document.getElementById('tab-pending');
    container.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const email = btn.dataset.email;
            const safeEmailId = email.replace(/[^a-zA-Z0-9]/g, "");
            
            // FIX: Get role and department from the new dropdowns
            const roleSelect = document.getElementById(`role-for-${safeEmailId}`);
            const deptSelect = document.getElementById(`dept-for-${safeEmailId}`);

            const role = roleSelect ? roleSelect.value : 'Standard';
            const department = deptSelect ? deptSelect.value : '';

            // Validation to ensure a department is selected
            if (!department) {
                return displayMessage('Please assign a department before approving.', 'error', 'message-box-container');
            }

            handleApproveUser(email, role, department, btn);
        });
    });
    container.querySelectorAll('.deny-btn').forEach(btn => {
        btn.addEventListener('click', () => handleDenyUser(btn.dataset.email, btn));
    });
}

function attachManageUsersListeners() {
    document.getElementById('addUserBtn')?.addEventListener('click', handleAddUser);
    renderUserList();
}

function attachPermissionsListeners() {
    const roleSelector = document.getElementById('role-selector');
    if (roleSelector) {
        roleSelector.addEventListener('change', () => renderPermissionsEditor(roleSelector.value));
        renderPermissionsEditor(roleSelector.value); // Initial render
    }
}

function renderPermissionsEditor(role) {
    const container = document.getElementById('permissions-editor-container');
    if (!container) return;
    const allowedPermissions = settingsCache.permissions?.[role] || [];
    const availablePermissions = Object.keys(ALL_PERMISSIONS).filter(p => !allowedPermissions.includes(p));
    const renderList = (perms) => perms.map(p => `
        <li class="permission-item" data-permission="${p}"><i class="fas ${ALL_PERMISSIONS[p].icon}"></i><span>${ALL_PERMISSIONS[p].text}</span></li>`).join('');
    container.innerHTML = `
        <div class="permissions-editor">
            <div class="permission-list-container">
                <h5>Available Permissions</h5><ul class="permission-list" id="available-perms">${renderList(availablePermissions)}</ul>
            </div>
            <div class="permission-controls">
                <button class="btn" id="add-perm-btn" title="Add Selected">&gt;</button>
                <button class="btn" id="remove-perm-btn" title="Remove Selected">&lt;</button>
            </div>
            <div class="permission-list-container">
                <h5>Allowed Permissions for ${role}</h5><ul class="permission-list" id="allowed-perms">${renderList(allowedPermissions)}</ul>
            </div>
        </div>`;
    attachPermissionsEditorListeners(role);
}

function attachPermissionsEditorListeners(role) {
    const availableList = document.getElementById('available-perms');
    const allowedList = document.getElementById('allowed-perms');
    availableList.addEventListener('click', e => e.target.closest('.permission-item')?.classList.toggle('selected'));
    allowedList.addEventListener('click', e => e.target.closest('.permission-item')?.classList.toggle('selected'));
    document.getElementById('add-perm-btn').addEventListener('click', () => movePermissions(role, availableList, allowedList, 'add'));
    document.getElementById('remove-perm-btn').addEventListener('click', () => movePermissions(role, allowedList, availableList, 'remove'));
}

function movePermissions(role, fromList, toList, action) {
    console.log(`%cAction: movePermissions() triggered.`, 'color: blue; font-weight: bold;');
    fromList.querySelectorAll('.selected').forEach(item => {
        const perm = item.dataset.permission;
        if (!settingsCache.permissions) settingsCache.permissions = {};
        if (!settingsCache.permissions[role]) settingsCache.permissions[role] = [];
        if (action === 'add') {
            settingsCache.permissions[role].push(perm);
        } else {
            settingsCache.permissions[role] = settingsCache.permissions[role].filter(p => p !== perm);
        }
        item.classList.remove('selected');
        toList.appendChild(item);
    });

    // Set the specific flag for permissions changes to true.
    unsavedChanges.permissions = true;

    // Call the function to update the button's visibility.
    updateSaveButtonVisibility();
}

/**
 * Shows or hides the "Save All Changes" button, checking for unsaved
 * changes only in the currently displayed view.
 */
function updateSaveButtonVisibility() {
    const saveBtn = document.getElementById('saveAllBtn');
    if (!saveBtn) return;

    let hasChanges = false;
    
    // Check the appropriate flag based on the current view/tab.
    if (activeView === 'UserManagement' && activeUserManagementTab === 'permissions') {
        hasChanges = unsavedChanges.permissions;
    } else if (activeView === 'DepartmentMappings') {
        hasChanges = unsavedChanges.departmentMappings;
    } else if (activeView === 'UserDatabases') {
        // This will be used if you make the databases editable.
        hasChanges = unsavedChanges.userDatabases;
    }
    
    // Final decision: Show or hide the button.
    if (hasChanges) {
        saveBtn.style.display = 'inline-block';
    } else {
        saveBtn.style.display = 'none';
    }
}


function handleUserClick(email) {
    const user = settingsCache.userRoles.find(u => u.email === email);
    if (!user) return;
    
    let permissionsHTML = Object.keys(ALL_PERMISSIONS).map(permKey => {
        const perm = ALL_PERMISSIONS[permKey];
        const userOverride = user.permissionOverrides?.[permKey];
        const isDefault = userOverride === undefined, isAllowed = userOverride === true, isDenied = userOverride === false;
        return `
            <div class="permission-override-item">
                <span><i class="fas ${perm.icon} fa-fw"></i> ${perm.text}</span>
                <div class="permission-override-controls">
                    <input type="radio" id="perm-${permKey}-default" name="${permKey}" value="default" ${isDefault ? 'checked' : ''}><label for="perm-${permKey}-default">Default</label>
                    <input type="radio" id="perm-${permKey}-allow" name="${permKey}" value="allow" ${isAllowed ? 'checked' : ''}><label for="perm-${permKey}-allow">Allow</label>
                    <input type="radio" id="perm-${permKey}-deny" name="${permKey}" value="deny" ${isDenied ? 'checked' : ''}><label for="perm-${permKey}-deny">Deny</label>
                </div>
            </div>`;
    }).join('');

    const modalContent = `<p>Override permissions for <strong>${user.email}</strong> (Role: ${user.role}).</p><div class="tool-card">${permissionsHTML}</div>`;
    
    const modal = document.getElementById('confirmationModal');
    // Clear any special classes before showing to ensure a clean state
    modal.className = 'modal'; 
    
    showConfirmationModal('Permission Overrides', modalContent, () => handleSaveUserOverrides(email));
    
    // This is the key change: Add the 'wide' class to the modal itself
    modal.classList.add('wide');
}

async function handleSaveUserOverrides(email) {
    const overrides = {};
    Object.keys(ALL_PERMISSIONS).forEach(permKey => {
        const selected = document.querySelector(`input[name="${permKey}"]:checked`).value;
        if (selected === 'allow') overrides[permKey] = true;
        else if (selected === 'deny') overrides[permKey] = false;
    });
    displayMessage('Saving overrides...', 'info', 'message-box-container');
    try {
        const userToUpdate = settingsCache.userRoles.find(u => u.email === email);
        if (!userToUpdate) throw new Error("Could not find user in cache to update.");

        const response = await apiFetch('/api/updateUserSettings', {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'updateUserOverrides', 
                payload: { email, overrides, uid: userToUpdate.id } 
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        
        if (userToUpdate) userToUpdate.permissionOverrides = overrides;
        displayMessage(result.message, 'success', 'message-box-container');
    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'message-box-container');
    }
}

async function handleApproveUser(email, role, department, btn) {
    showSpinner(btn);
    try {
        const userToApprove = settingsCache.pendingUsers.find(u => u.email === email);
        if (!userToApprove) throw new Error("Could not find pending user to approve.");

        const response = await apiFetch('/api/updateUserSettings', {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'approveUser', 
                payload: { email, role, department, uid: userToApprove.id } 
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        displayMessage(result.message, 'success', 'message-box-container');
        await fetchAdminSettingsData(); // Refresh all data

    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'message-box-container');
        hideSpinner(btn);
    }
}

async function handleDenyUser(email, btn) {
    showSpinner(btn);
    try {
        const userToDeny = settingsCache.pendingUsers.find(u => u.email === email);
        if (!userToDeny) throw new Error("Could not find pending user to deny.");

        const response = await apiFetch('/api/updateUserSettings', {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'denyUser', 
                payload: { email, uid: userToDeny.id } 
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        displayMessage(result.message, 'success', 'message-box-container');
        await fetchAdminSettingsData(); // Refresh all data

    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'message-box-container');
        hideSpinner(btn);
    }
}

async function handleAddUser() {
    const emailInput = document.getElementById('newUserEmail');
    const roleInput = document.getElementById('newUserRole');
    const email = emailInput.value.trim();
    const role = roleInput.value;
    if (!email || !role) {
        return displayMessage('Email and Role are required.', 'error', 'message-box-container');
    }
    const btn = document.getElementById('addUserBtn');
    showSpinner(btn);
    try {
        // NOTE: The backend `addUser` action needs to handle both creating a new user stub
        // or updating an existing one based on email. UID is not sent for new users.
        const response = await apiFetch('/api/updateUserSettings', {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'addUser', 
                payload: { email, role } 
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        
        displayMessage(result.message, 'success', 'message-box-container');
        await fetchAdminSettingsData(); // Refresh data
        emailInput.value = '';

    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'message-box-container');
    } finally {
        hideSpinner(btn);
    }
}

function handleDeleteUser(email) {
    if (!email) return;
    const confirmationMessage = `Are you sure you want to remove the user <strong>${email}</strong>?`;
    showConfirmationModal('Confirm Deletion', confirmationMessage, async () => {
        displayMessage('Processing...', 'info', 'message-box-container');
        try {
            const userToDelete = settingsCache.userRoles.find(u => u.email.toLowerCase() === email.toLowerCase());
            if (!userToDelete) throw new Error("Could not find user to delete.");

            const response = await apiFetch('/api/updateUserSettings', {
                method: 'POST',
                body: JSON.stringify({ 
                    action: 'deleteUser', 
                    payload: { email, uid: userToDelete.id } 
                })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            displayMessage(result.message, 'success', 'message-box-container');
            await fetchAdminSettingsData(); // Refresh data

        } catch (error) {
            displayMessage(`Error: ${error.message}`, 'error', 'message-box-container');
        }
    });
}

/**
 * Gathers all staged settings and sends them to the server to be saved.
 */
async function handleSaveAllSettings() {
    const btn = document.getElementById('saveAllBtn');
    showSpinner(btn);

    try {
        const payload = {};
        if (unsavedChanges.permissions) {
            payload.permissions = settingsCache.permissions;
        }
        if (unsavedChanges.departmentMappings) {
            payload.dropdowns = settingsCache.dropdowns;
        }

        if (Object.keys(payload).length === 0) {
            hideSpinner(btn);
            return displayMessage("No changes to save.", "info", "message-box-container");
        }

        // --- START: ADDED AUTHENTICATION ---
        const user = firebase.auth().currentUser;
        if (!user) throw new Error("Authentication required to save settings.");
        const token = await user.getIdToken();
        // --- END: ADDED AUTHENTICATION ---

        const response = await fetch('/api/updateAdminSettings', {
             method: 'POST',
             headers: {
                 'Content-Type': 'application/json',
                 // Add the Authorization header to the request
                 'Authorization': `Bearer ${token}`
             },
             // The payload must be wrapped in a 'payload' object to match the backend
             body: JSON.stringify({ payload })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        
        if (payload.dropdowns) unsavedChanges.departmentMappings = false;
        if (payload.permissions) unsavedChanges.permissions = false;
        
        updateSaveButtonVisibility();
        displayMessage(result.message, 'success', 'message-box-container');

    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'message-box-container');
    } finally {
        hideSpinner(btn);
    }
}

/**
 * Shows the permissions modal and populates it with the correct user data and permissions.
 */
async function showUserPermissionsModal(email) {
    const modal = document.getElementById('permissionsModal');
    const roleSelect = modal.querySelector('#role-select');
    const permissionsContainer = modal.querySelector('#permissions-container');
    const saveBtn = modal.querySelector('#save-permissions-btn');
    const modalTitle = modal.querySelector('h3');

    // Find the full user object from the cache
    const user = settingsCache.userRoles.find(u => u.email === email);
    if (!user) {
        displayMessage('Could not find user data.', 'error', 'user-management-message-box');
        return;
    }
    const currentRole = user.role;
    const currentOverrides = user.permissionOverrides || {};

    modalTitle.textContent = `Edit Permissions for ${email}`;
    roleSelect.value = currentRole;
    saveBtn.onclick = () => handleSavePermissions(email);

    // Fetch the global permission defaults for all roles from Firestore
    const permissionsDoc = await firebase.firestore().collection('settings').doc('permissions').get();
    const allRolePermissions = permissionsDoc.exists ? permissionsDoc.data() : {};

    // This function will be called whenever the role dropdown changes
    const updateCheckboxes = () => {
        const selectedRole = roleSelect.value;
        const roleDefaults = allRolePermissions[selectedRole] || {};
        
        permissionsContainer.innerHTML = Object.entries(ALL_PERMISSIONS).map(([key, perm]) => {
            // A permission is checked if it has a specific override for this user,
            // otherwise, it falls back to the default for the selected role.
            const isChecked = currentOverrides[key] !== undefined ? currentOverrides[key] : !!roleDefaults[key];
            const isDisabled = selectedRole === 'Master Admin' ? 'disabled' : '';

            return `
                <div class="permission-item">
                    <label class="checkbox-label">
                        <input type="checkbox" name="${key}" ${isChecked ? 'checked' : ''} ${isDisabled}>
                        <i class="fas ${perm.icon}"></i>
                        <span>${perm.text}</span>
                    </label>
                </div>
            `;
        }).join('');
    };

    roleSelect.onchange = updateCheckboxes;
    updateCheckboxes(); // Initial render of checkboxes
    
    modal.classList.add('active');
}


/**
 * Gathers the new role and all permission checkbox states and saves them.
 */
async function handleSavePermissions(email) {
    const btn = document.getElementById(`save-permissions-btn`);
    const modal = document.getElementById('permissionsModal');
    const roleSelect = modal.querySelector('#role-select');
    
    // Gather all the permission states from the checkboxes
    const permissions = {};
    for (const key in ALL_PERMISSIONS) {
        const checkbox = modal.querySelector(`input[name="${key}"]`);
        if (checkbox) {
            permissions[key] = checkbox.checked;
        }
    }
    
    const payload = {
        email: email,
        role: roleSelect.value,
        permissions: permissions
    };

    showSpinner(btn);

    try {
        const user = firebase.auth().currentUser;
        if (!user) throw new Error("Authentication required.");
        const token = await user.getIdToken();

        // Call the new, dedicated endpoint to save the data
        const response = await fetch('/api/updateUserPermissions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ payload })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        
        displayMessage(result.message, 'success', 'user-management-message-box');
        
        // Refresh the page data to show the updated role and permissions
        fetchAdminSettingsData(); 
        modal.classList.remove('active');

    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'permissions-message-box');
    } finally {
        hideSpinner(btn);
    }
}

// --- 5. USER DATABASES SPECIFIC FUNCTIONS ---

function renderUserDatabasesView() {
    // This line checks our global configuration from script.js
    const showStudentTab = AppConfig.features.studentsEnabled;

    return `
        <h3>User Databases</h3>
        <p>Manage the master lists of staff available for checkouts.</p>
        <div class="content-tab-navigation">
            <button class="content-tab-button ${activeDatabaseTab === 'staff' ? 'active' : ''}" data-tab="staff"><i class="fas fa-chalkboard-teacher"></i> Staff Database</button>
            
            ${showStudentTab ? `<button class="content-tab-button ${activeDatabaseTab === 'student' ? 'active' : ''}" data-tab="student"><i class="fas fa-user-graduate"></i> Student Database</button>` : ''}
        </div>
        <div id="db-tab-content"></div>
    `;
}

function attachUserDatabasesListeners() {
    document.querySelectorAll('.content-tab-button').forEach(button => {
        button.addEventListener('click', () => {
            activeDatabaseTab = button.dataset.tab;
            renderUserDatabasesContent(); // Re-render the content for the selected tab
        });
    });
    renderUserDatabasesContent(); // Initial render
}

function renderUserDatabasesContent() {
    const container = document.getElementById('db-tab-content');
    if (!container) return;

    if (activeDatabaseTab === 'staff') {
        container.innerHTML = renderStaffDatabaseView();
        attachStaffDatabaseListeners();
    } else if (activeDatabaseTab === 'student') {
        container.innerHTML = renderStudentDatabaseView();
        attachStudentDatabaseListeners();
    }
}

// --- Staff Database ---
function renderStaffDatabaseView() {
    // Get a list of department options for the dropdown
    const departmentOptions = (settingsCache.dropdowns?.Departments || [])
        .map(d => `<option value="${d}">${d}</option>`)
        .join('');

    return `
        <div class="user-management-grid">
            <div class="tool-card">
                <h4><i class="fas fa-user-plus"></i> Add New Staff</h4>
                <div class="form-group">
                    <label for="newStaffName">Staff Name</label>
                    <input type="text" id="newStaffName" class="form-control" placeholder="Enter full name...">
                </div>
                <div class="form-group">
                    <label for="newStaffEmail">Staff Email</label>
                    <input type="email" id="newStaffEmail" class="form-control" placeholder="Enter email address...">
                </div>
                <div class="form-group">
                    <label for="newStaffDepartment">Department</label>
                    <select id="newStaffDepartment" class="form-control">
                        <option value="">-- Select Department --</option>
                        ${departmentOptions}
                    </select>
                </div>
                <button id="addStaffBtn" class="btn btn-success"><i class="fas fa-plus"></i> Add Staff</button>
                <hr style="margin: 2rem 0;">
                <h5><i class="fas fa-file-csv"></i> Bulk Import Staff</h5>
                <div class="form-group">
                    <label for="staffCsvFile" style="font-size: 0.9em;">Requires headers: <strong>name, email, department</strong></label>
                    <input type="file" id="staffCsvFile" class="form-control" accept=".csv">
                </div>
                <button id="importStaffBtn" class="btn"><i class="fas fa-upload"></i> Import Staff CSV</button>
            </div>
            <div class="tool-card">
                <h4><i class="fas fa-list-ul"></i> Current Staff</h4>
                <div id="staff-list-container"></div>
            </div>
        </div>`;
}

function attachStaffDatabaseListeners() {
    renderStaffList();
    document.getElementById('addStaffBtn').addEventListener('click', handleAddStaff);
    document.getElementById('importStaffBtn').addEventListener('click', () => handleCsvImport('staff'));
}

function renderStaffList() {
    const container = document.getElementById('staff-list-container');
    const staff = settingsCache.staffList || [];
    const listHTML = staff.length > 0 ? staff.sort((a,b) => a.name.localeCompare(b.name)).map(s => `
        <li class="user-list-item">
            <div class="user-info"><span class="user-email">${s.name}</span><span class="user-role">${s.email}</span></div>
            <button class="delete-btn" data-email="${s.email}" title="Remove Staff">&times;</button>
        </li>`).join('') : '<li class="user-list-item" style="justify-content:center;">No staff found.</li>';
    container.innerHTML = `<ul class="user-list">${listHTML}</ul>`;
    container.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => handleDeleteStaff(btn.dataset.email)));
}

// --- Student Database ---
function renderStudentDatabaseView() {
    return `
        <div class="user-management-grid">
            <div class="tool-card">
                <h4><i class="fas fa-user-plus"></i> Add New Student</h4>
                <div class="form-group"><label for="newStudentName">Student Name</label><input type="text" id="newStudentName" class="form-control" placeholder="Enter full name..."></div>
                <div class="form-group"><label for="newStudentId">Student ID</label><input type="text" id="newStudentId" class="form-control" placeholder="Enter ID number..."></div>
                <div class="form-group"><label for="newStudentEmail">Student Email (Optional)</label><input type="email" id="newStudentEmail" class="form-control" placeholder="Enter email address..."></div>
                <button id="addStudentBtn" class="btn btn-success"><i class="fas fa-plus"></i> Add Student</button>
                <hr style="margin: 2rem 0;">
                <h5><i class="fas fa-file-csv"></i> Bulk Import Students</h5>
                <div class="form-group"><label for="studentCsvFile" style="font-size: 0.9em;">Requires headers: <strong>id, name, email</strong></label><input type="file" id="studentCsvFile" class="form-control" accept=".csv"></div>
                <button id="importStudentBtn" class="btn"><i class="fas fa-upload"></i> Import Student CSV</button>
            </div>
            <div class="tool-card">
                <h4><i class="fas fa-list-ul"></i> Current Students</h4>
                <div id="student-list-container"></div>
            </div>
        </div>`;
}

function attachStudentDatabaseListeners() {
    renderStudentList();
    document.getElementById('addStudentBtn').addEventListener('click', handleAddStudent);
    document.getElementById('importStudentBtn').addEventListener('click', () => handleCsvImport('student'));
}

function renderStudentList() {
    const container = document.getElementById('student-list-container');
    const students = settingsCache.studentList || [];
    const listHTML = students.length > 0 ? students.sort((a,b) => a.name.localeCompare(b.name)).map(s => `
        <li class="user-list-item">
            <div class="user-info"><span class="user-email">${s.name}</span><span class="user-role">ID: ${s.id}</span></div>
            <button class="delete-btn" data-id="${s.id}" title="Remove Student">&times;</button>
        </li>`).join('') : '<li class="user-list-item" style="justify-content:center;">No students found.</li>';
    container.innerHTML = `<ul class="user-list">${listHTML}</ul>`;
    container.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => handleDeleteStudent(btn.dataset.id)));
}

// --- Handlers for Database Actions ---

async function handleAddStaff() {
    const name = document.getElementById('newStaffName').value.trim();
    const email = document.getElementById('newStaffEmail').value.trim();
    if (!name || !email) return displayMessage('Staff name and email are required.', 'error', 'message-box-container');
    
    await updateUserDatabase('addUser', 'staff', { name, email });
}

async function handleDeleteStaff(email) {
    showConfirmationModal('Confirm Deletion', `Are you sure you want to remove staff member ${email}?`, async () => {
        await updateUserDatabase('deleteUser', 'staff', { email });
    });
}

async function handleAddStudent() {
    const name = document.getElementById('newStudentName').value.trim();
    const id = document.getElementById('newStudentId').value.trim();
    const email = document.getElementById('newStudentEmail').value.trim();
    if (!name || !id) return displayMessage('Student name and ID are required.', 'error', 'message-box-container');
    
    await updateUserDatabase('addUser', 'student', { name, id, email });
}

async function handleDeleteStudent(id) {
    showConfirmationModal('Confirm Deletion', `Are you sure you want to remove student with ID ${id}?`, async () => {
        await updateUserDatabase('deleteUser', 'student', { id });
    });
}

function handleCsvImport(userType) {
    const fileInput = document.getElementById(`${userType}CsvFile`);
    const file = fileInput.files[0];
    if (!file) return displayMessage('Please select a CSV file.', 'error', 'message-box-container');
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        const csvText = event.target.result;
        const lines = csvText.split('\n').filter(line => line.trim() !== '');
        if (lines.length < 2) return displayMessage('CSV is empty or contains only a header.', 'error', 'message-box-container');
        
        const headers = lines.shift().split(',').map(h => h.trim());
        const users = lines.map(line => {
            const values = line.split(',');
            let user = {};
            headers.forEach((header, index) => user[header] = values[index]?.trim());
            return user;
        });

        await updateUserDatabase('bulkImport', userType, { users });
    };
    reader.readAsText(file);
}

async function updateUserDatabase(action, userType, payload) {
    displayMessage('Processing...', 'info', 'message-box-container');
    try {
        const response = await apiFetch('/api/updateUserDatabases', {
            method: 'POST',
            body: JSON.stringify({ action, userType, payload })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        
        displayMessage(result.message, 'success', 'message-box-container');
        fetchAdminSettingsData(); // Refresh all data to show changes
    } catch(error) {
        displayMessage(`Error: ${error.message}`, 'error', 'message-box-container');
    }
}


// --- 6. DEPARTMENT MAPPINGS & PURPOSE (REFACTORED TO MASTER-DETAIL) ---

// New state variables to track selections
let selectedDept = null;
let selectedProg = null;

function renderDepartmentMappingsView() {
    return `
        <h3>Department & Purpose Mappings</h3>
        <p>Manage departments, programs, courses, and transaction purposes. Changes are staged here and will be saved globally when you click "Save All Changes".</p>

        <div class="mappings-grid" style="margin-top: 1.5rem;">
            <div id="departments-col" class="mappings-column"></div>
            <div id="programs-col" class="mappings-column"></div>
            <div id="courses-col" class="mappings-column"></div>
        </div>
    `;
}

function attachDepartmentMappingsListeners() {
    renderDepartmentsColumn();
    renderProgramsColumn();
    renderCoursesColumn();
}

// --- Column Rendering Functions ---

function renderDepartmentsColumn() {
    const container = document.getElementById('departments-col');
    if (!container) return;

    const depts = settingsCache.dropdowns?.Departments || [];
    const deptListHtml = depts.length > 0
        ? depts.sort().map(dept => `
            <li class="mappings-list-item ${selectedDept === dept ? 'active' : ''}" data-dept="${dept}">
                <span>${dept}</span>
                <button class="delete-btn" data-dept="${dept}" title="Delete Department">&times;</button>
            </li>
        `).join('')
        : `<li class="mappings-placeholder" style="padding: 20px;">No departments found.</li>`;

    container.innerHTML = `
        <h4><i class="fas fa-building"></i> Departments</h4>
        <ul class="mappings-list">${deptListHtml}</ul>
        <div class="tool-card" style="margin-top: 1.5rem; padding: 15px;">
            <div class="form-group">
                <label for="newDepartmentName">Add New Department</label>
                <input type="text" id="newDepartmentName" class="form-control" placeholder="New department name...">
            </div>
            <button id="addDepartmentBtn" class="btn btn-block">Add Department</button>
        </div>

        <hr style="margin: 2rem 0; border-style: dashed;">

        <h4><i class="fas fa-tags"></i> Purpose Items</h4>
        <ul id="purpose-list-container" class="mappings-list"></ul>
        <div class="tool-card" style="margin-top: 1.5rem; padding: 15px;">
             <div class="form-group">
                <label for="newPurposeItem">Add New Purpose</label>
                <input type="text" id="newPurposeItem" class="form-control" placeholder="e.g., Classroom Project">
            </div>
            <button id="addPurposeBtn" class="btn btn-block">Add Purpose</button>
        </div>
    `;

    // Attach listeners for departments
    container.querySelectorAll('.mappings-list-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.matches('.delete-btn')) {
                e.stopPropagation();
                handleDeleteDepartment(e.target.dataset.dept);
            } else {
                selectedDept = item.dataset.dept;
                selectedProg = null; // Reset program selection
                attachDepartmentMappingsListeners(); // Redraw all columns
            }
        });
    });
    document.getElementById('addDepartmentBtn')?.addEventListener('click', handleAddDepartment);

    // Render and attach listeners for purposes
    renderPurposeList();
    document.getElementById('addPurposeBtn')?.addEventListener('click', handleAddPurpose);
}

function renderProgramsColumn() {
    const container = document.getElementById('programs-col');
    if (!container) return;

    if (!selectedDept) {
        container.innerHTML = `<div class="mappings-placeholder">Select a department to see its programs.</div>`;
        return;
    }

    const programs = settingsCache.dropdowns?.DepartmentMap?.[selectedDept]?.Programs || {};
    const programKeys = Object.keys(programs);
    const programListHtml = programKeys.length > 0
        ? programKeys.sort().map(prog => `
            <li class="mappings-list-item ${selectedProg === prog ? 'active' : ''}" data-prog="${prog}">
                <span>${prog}</span>
                <button class="delete-btn" data-prog="${prog}" title="Delete Program">&times;</button>
            </li>
        `).join('')
        : `<li class="mappings-placeholder" style="padding: 20px;">No programs found.</li>`;

    container.innerHTML = `
        <h4><i class="fas fa-sitemap"></i> Programs in ${selectedDept}</h4>
        <ul class="mappings-list">${programListHtml}</ul>
        <div class="tool-card" style="margin-top: 1.5rem; padding: 15px;">
            <div class="form-group">
                <label for="newProgramName">Add New Program</label>
                <input type="text" id="newProgramName" class="form-control" placeholder="New program name...">
            </div>
            <button id="addProgramBtn" class="btn btn-block">Add Program</button>
        </div>
    `;

    container.querySelectorAll('.mappings-list-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.matches('.delete-btn')) {
                e.stopPropagation();
                handleDeleteProgram(selectedDept, e.target.dataset.prog);
            } else {
                selectedProg = item.dataset.prog;
                renderProgramsColumn(); // Redraw this column for selection highlight
                renderCoursesColumn(); // Redraw next column
            }
        });
    });
    document.getElementById('addProgramBtn')?.addEventListener('click', () => handleAddProgram(selectedDept));
}

function renderCoursesColumn() {
    const container = document.getElementById('courses-col');
    if (!container) return;

    if (!selectedDept || !selectedProg) {
        container.innerHTML = `<div class="mappings-placeholder">Select a program to see its courses.</div>`;
        return;
    }

    const courses = settingsCache.dropdowns?.DepartmentMap?.[selectedDept]?.Programs?.[selectedProg] || [];
    const courseListHtml = courses.length > 0
        ? courses.sort().map(course => `
            <li class="mappings-list-item">
                <span>${course}</span>
                <button class="delete-btn" data-course="${course}" title="Delete Course">&times;</button>
            </li>
        `).join('')
        : `<li class="mappings-placeholder" style="padding: 20px;">No courses found.</li>`;

    container.innerHTML = `
        <h4><i class="fas fa-graduation-cap"></i> Courses in ${selectedProg}</h4>
        <ul class="mappings-list">${courseListHtml}</ul>
        <div class="tool-card" style="margin-top: 1.5rem; padding: 15px;">
            <div class="form-group">
                <label for="newCourseName">Add New Course</label>
                <input type="text" id="newCourseName" class="form-control" placeholder="New course name...">
            </div>
            <button id="addCourseBtn" class="btn btn-block">Add Course</button>
        </div>
    `;

    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => handleDeleteCourse(selectedDept, selectedProg, btn.dataset.course));
    });
    document.getElementById('addCourseBtn')?.addEventListener('click', () => handleAddCourse(selectedDept, selectedProg));
}

// --- Handler Functions (Refactored) ---

// In /public/admin-settings.js
// REPLACE the existing handleAddDepartment function with this one

function handleAddDepartment() {
    const input = document.getElementById('newDepartmentName');
    const deptName = input.value.trim();
    if (!deptName) return;

    // --- THIS IS THE FIX ---
    // Ensure the dropdowns and Departments properties exist before using them.
    if (!settingsCache.dropdowns) {
        settingsCache.dropdowns = {};
    }
    if (!settingsCache.dropdowns.Departments) {
        settingsCache.dropdowns.Departments = [];
    }
    // --- END OF FIX ---

    if (settingsCache.dropdowns.Departments.includes(deptName)) {
        return displayMessage(`Department "${deptName}" already exists.`, 'error', 'message-box-container');
    }
    
    settingsCache.dropdowns.Departments.push(deptName);
    if (!settingsCache.dropdowns.DepartmentMap) settingsCache.dropdowns.DepartmentMap = {};
    settingsCache.dropdowns.DepartmentMap[deptName] = { Programs: {} };
    
    input.value = '';
    unsavedChanges.departmentMappings = true;
    renderDepartmentsColumn();
    updateSaveButtonVisibility();
}

function handleDeleteDepartment(dept) {
    showConfirmationModal('Confirm Deletion', `Delete <strong>${dept}</strong> and all its programs/courses?`, () => {
        settingsCache.dropdowns.Departments = settingsCache.dropdowns.Departments.filter(d => d !== dept);
        delete settingsCache.dropdowns.DepartmentMap[dept];
        if (selectedDept === dept) {
            selectedDept = null;
            selectedProg = null;
        }
        unsavedChanges.departmentMappings = true;
        attachDepartmentMappingsListeners();
        updateSaveButtonVisibility();
    });
}

function handleAddProgram(dept) {
    const input = document.getElementById('newProgramName');
    const progName = input.value.trim();
    if (!progName || !dept) return;
    if (settingsCache.dropdowns.DepartmentMap[dept].Programs[progName]) {
        return displayMessage(`Program "${progName}" already exists.`, 'error', 'message-box-container');
    }
    settingsCache.dropdowns.DepartmentMap[dept].Programs[progName] = [];
    input.value = '';
    unsavedChanges.departmentMappings = true;
    renderProgramsColumn();
    updateSaveButtonVisibility();
}

function handleDeleteProgram(dept, prog) {
    showConfirmationModal('Confirm Deletion', `Delete program <strong>${prog}</strong>?`, () => {
        delete settingsCache.dropdowns.DepartmentMap[dept].Programs[prog];
        if (selectedProg === prog) {
            selectedProg = null;
        }
        unsavedChanges.departmentMappings = true;
        renderProgramsColumn();
        renderCoursesColumn();
        updateSaveButtonVisibility();
    });
}

function handleAddCourse(dept, prog) {
    const input = document.getElementById('newCourseName');
    const courseName = input.value.trim();
    if (!courseName || !dept || !prog) return;
    if (settingsCache.dropdowns.DepartmentMap[dept].Programs[prog].includes(courseName)) {
        return displayMessage(`Course "${courseName}" already exists.`, 'error', 'message-box-container');
    }
    settingsCache.dropdowns.DepartmentMap[dept].Programs[prog].push(courseName);
    input.value = '';
    unsavedChanges.departmentMappings = true;
    renderCoursesColumn();
    updateSaveButtonVisibility();
}

function handleDeleteCourse(dept, prog, course) {
    const courses = settingsCache.dropdowns.DepartmentMap[dept].Programs[prog];
    settingsCache.dropdowns.DepartmentMap[dept].Programs[prog] = courses.filter(c => c !== course);
    unsavedChanges.departmentMappings = true;
    renderCoursesColumn();
    updateSaveButtonVisibility();
}

function renderPurposeList() {
    const container = document.getElementById('purpose-list-container');
    if (!container) return;
    const purposes = settingsCache.dropdowns?.Purpose || [];

    if (purposes.length === 0) {
        container.innerHTML = `<li class="mappings-placeholder" style="padding: 20px;">No purpose items.</li>`;
        return;
    }

    container.innerHTML = purposes.sort().map(p => `
        <li class="mappings-list-item">
            <span>${p}</span>
            <button class="delete-btn" data-purpose="${p}" title="Delete Purpose">&times;</button>
        </li>
    `).join('');

    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => handleDeletePurpose(btn.dataset.purpose));
    });
}

function handleAddPurpose() {
    const input = document.getElementById('newPurposeItem');
    const purposeName = input.value.trim();
    if (!purposeName) return;
    if (!settingsCache.dropdowns.Purpose) settingsCache.dropdowns.Purpose = [];
    if (settingsCache.dropdowns.Purpose.includes(purposeName)) {
        return displayMessage(`Purpose "${purposeName}" already exists.`, 'error', 'message-box-container');
    }
    settingsCache.dropdowns.Purpose.push(purposeName);
    input.value = '';
    unsavedChanges.departmentMappings = true;
    renderPurposeList();
    updateSaveButtonVisibility();
}

function handleDeletePurpose(purpose) {
    settingsCache.dropdowns.Purpose = settingsCache.dropdowns.Purpose.filter(p => p !== purpose);
    unsavedChanges.departmentMappings = true;
    renderPurposeList();
    updateSaveButtonVisibility();
}


// --- . GLOBAL SAVE & VISIBILITY LOGIC ---

function updateSaveButtonVisibility() {
    const saveBtn = document.getElementById('saveAllBtn');
    if (!saveBtn) return;

    let hasChanges = false;
    
    if (activeView === 'UserManagement' && activeUserManagementTab === 'permissions') {
        hasChanges = unsavedChanges.permissions;
    } else if (activeView === 'DepartmentMappings') {
        hasChanges = unsavedChanges.departmentMappings;
    } else if (activeView === 'UserDatabases') {
        hasChanges = unsavedChanges.userDatabases;
    }
    
    if (hasChanges) {
        saveBtn.style.display = 'inline-block';
    } else {
        saveBtn.style.display = 'none';
    }
}


async function handleSaveAllSettings() {
    const btn = document.getElementById('saveAllBtn');
    showSpinner(btn);

    try {
        const payload = {};
        if (unsavedChanges.permissions) {
            payload.permissions = settingsCache.permissions;
        }
        if (unsavedChanges.departmentMappings) {
            payload.dropdowns = settingsCache.dropdowns;
        }

        if (Object.keys(payload).length === 0) {
            hideSpinner(btn);
            return displayMessage("No changes to save.", "info", "message-box-container");
        }

        const response = await apiFetch('/api/updateAdminSettings', {
             method: 'POST',
             body: JSON.stringify({ payload })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        
        if (payload.dropdowns) unsavedChanges.departmentMappings = false;
        if (payload.permissions) unsavedChanges.permissions = false;
        
        updateSaveButtonVisibility();
        displayMessage(result.message, 'success', 'message-box-container');

    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'message-box-container');
    } finally {
        hideSpinner(btn);
    }
}


/**
 * Renders the HTML for the System Tools view.
 */
function renderSystemToolsView() {
    return `
        <h3><i class="fas fa-cogs"></i> System Tools</h3>
        <p>Perform high-level maintenance and system-wide actions. Use with caution.</p>

        <div class="tool-card" style="margin-top: 1.5rem;">
            <h4>Transfer Master Admin Role</h4>
            <p>Transfer the Master Admin role to another user. This action cannot be undone, and your role will be changed to 'Admin'.</p>
            <div class="form-group">
                <label for="newMasterAdminEmail">New Master Admin's Email</label>
                <input type="email" id="newMasterAdminEmail" class="form-control" placeholder="user@example.com">
            </div>
            <button id="changeMasterAdminBtn" class="btn btn-warning">Transfer Role</button>
        </div>

        <div class="tool-card" style="margin-top: 1.5rem; border-color: var(--error-color);">
            <h4><i class="fas fa-exclamation-triangle"></i> Danger Zone</h4>
            <p>The "Master Reset" function reverts all items to an "IN" status and wipes the transaction log. This action cannot be undone.</p>
            <button id="masterResetBtn" class="btn btn-danger">Perform Master Reset</button>
        </div>
        <div id="system-tools-message-box" class="message-box" style="margin-top: 1rem;"></div>
    `;
}

/**
 * Attaches event listeners for the System Tools view.
 */
function attachSystemToolsListeners() {
    document.getElementById('masterResetBtn')?.addEventListener('click', handleMasterReset);
    document.getElementById('changeMasterAdminBtn')?.addEventListener('click', handleMasterAdminChange);

}

/**
 * Handles the Master Reset confirmation and API call.
 */
function handleMasterReset() {
    const confirmationMessage = `
        <p>This will permanently delete all transaction history and reset every item's status to "IN". This action cannot be undone.</p>
        <div style="margin-top: 15px; padding: 10px; background-color: #f8f9fa; border-radius: 6px;">
            <label class="checkbox-label" style="display:flex; align-items:center; gap:10px;">
                <input type="checkbox" id="resetLostDamagedCheck" style="width:auto;">
                
                <span>Reset all "Damaged" stock counts to zero (this does not recover "Lost" items).</span>

            </label>
        </div>
    `;

    showConfirmationModal('Confirm Master Reset', confirmationMessage, async () => {
        const resetLostDamaged = document.getElementById('resetLostDamagedCheck').checked;
        displayMessage('Processing Master Reset... This may take a moment.', 'info', 'system-tools-message-box', 0);

        try {
            const response = await fetch('/api/updateInventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'masterReset', payload: { resetLostDamaged } })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            displayMessage(result.message, 'success', 'system-tools-message-box');
        } catch (error) {
            displayMessage(`Error: ${error.message}`, 'error', 'system-tools-message-box');
        }
    });
}


// In admin-settings.js
// PASTE THIS ENTIRE BLOCK AT THE END OF THE FILE

// --- 7. DATA & REPORTING SPECIFIC FUNCTIONS ---

/**
 * Renders the HTML structure for the Data & Reporting view.
 */
function renderDataReportingView() {
    // Only users with permission will see this view.
    // We can add a department filter for non-Master Admins later.
    return `
        <h3><i class="fas fa-chart-bar"></i> Data & Reporting</h3>
        <p>View and export raw data from the application's database.</p>
        
        <div class="tool-card" style="margin-top: 1.5rem;">
            <div class="form-grid" style="grid-template-columns: 2fr 1fr 1fr; align-items: end;">
                <div class="form-group">
                    <label for="dataTypeSelect">Select Data to View</label>
                    <select id="dataTypeSelect" class="form-control">
                        <option value="">-- Select --</option>
                        <option value="inventory">Full Inventory</option>
                        <option value="transactions">Transaction History</option>
                        <option value="users">User List</option>
                        <option value="staff">Staff Database</option>
                        <option value="students">Student Database</option>
                    </select>
                </div>
                <div class="form-group">
                     <button id="viewDataBtn" class="btn" style="width: 100%;"><i class="fas fa-eye"></i> View Data</button>
                </div>
                <div class="form-group">
                    <button id="exportDataBtn" class="btn btn-success" style="width: 100%;" disabled><i class="fas fa-file-excel"></i> Export to Sheets</button>
                </div>
            </div>
            <div id="report-message-box" class="message-box" style="display: none; margin-top: 1rem;"></div>
        </div>

        <div class="content-block" style="margin-top: 2rem;">
            <h4>Data Preview</h4>
            <div id="data-preview-container" class="table-container" style="max-height: 500px; overflow-y: auto;">
                <p style="text-align: center; color: #888;">Select a data type and click "View Data" to see a preview.</p>
            </div>
        </div>
    `;
}

/**
 * Attaches event listeners for the Data & Reporting view.
 */
function attachDataReportingListeners() {
    document.getElementById('viewDataBtn')?.addEventListener('click', handleViewData);
    document.getElementById('exportDataBtn')?.addEventListener('click', handleExportData);
}


// in public/admin-settings.js
// REPLACE the existing handleViewData function with this one

async function handleViewData() {
    const dataType = document.getElementById('dataTypeSelect').value;
    const container = document.getElementById('data-preview-container');
    const exportBtn = document.getElementById('exportDataBtn');
    
    if (!dataType) {
        displayMessage('Please select a data type to view.', 'error', 'report-message-box');
        return;
    }

    container.innerHTML = `<div class="loading-placeholder"><span class="spinner"></span> Fetching data...</div>`;
    exportBtn.disabled = true;

    try {
        const response = await apiFetch(`/api/getDataForReport?type=${dataType}`, {
            method: 'POST', 
            body: JSON.stringify({})
        });

        if (!response.ok) {
            const errorResult = await response.json();
            throw new Error(errorResult.error || 'Failed to fetch data from the server.');
        }
        
        const data = await response.json();

        if (data.length === 0) {
            container.innerHTML = `<p style="text-align: center; color: #888;">No data found for this selection.</p>`;
            return;
        }

        window.currentReportData = data; 
        
        const headers = Object.keys(data[0]);
        let tableHtml = '<table class="visual-layout-grid" style="width: 100%;"><thead><tr>';
        headers.forEach(h => tableHtml += `<th>${h}</th>`);
        tableHtml += '</tr></thead><tbody>';

        data.forEach(row => {
            tableHtml += '<tr>';
            headers.forEach(h => {
                let value = row[h];
                
                // --- FIX STARTS HERE: Truncate long strings for better display ---
                if (typeof value === 'object' && value !== null) {
                    value = JSON.stringify(value);
                }
                
                // If it's image data, show a placeholder.
                if (h === 'imageUrl' && typeof value === 'string' && value.startsWith('data:image')) {
                    value = '[Image Data]';
                } 
                // For any other very long string (like the ID), truncate it.
                else if (typeof value === 'string' && value.length > 30) {
                    value = `<span title="${value}">${value.substring(0, 27)}...</span>`;
                }
                // --- FIX ENDS HERE ---

                tableHtml += `<td>${value || ''}</td>`;
            });
            tableHtml += '</tr>';
        });

        tableHtml += '</tbody></table>';
        container.innerHTML = tableHtml;
        exportBtn.disabled = false;

    } catch (error) {
        container.innerHTML = `<p style="text-align: center; color: var(--error-color);">${error.message}</p>`;
    }
}

// in public/admin-settings.js
// REPLACE the existing handleExportData function with this one

async function handleExportData() {
    const exportBtn = document.getElementById('exportDataBtn');
    showSpinner(exportBtn);

    try {
        if (!window.currentReportData) {
            throw new Error("No data available to export.");
        }
        
        // --- FIX STARTS HERE: Clean the data before exporting ---
        const formattedData = window.currentReportData.map(row => {
            const newRow = { ...row }; // Create a copy to avoid changing the original data
            if (newRow.imageUrl && typeof newRow.imageUrl === 'string' && newRow.imageUrl.startsWith('data:image')) {
                newRow.imageUrl = '[Embedded Image Data]'; // Replace with a clean placeholder
            }
            return newRow;
        });
        // --- FIX ENDS HERE ---

        const response = await apiFetch('/api/exportToCsv', {
            method: 'POST',
            // Send the newly formatted data instead of the raw data
            body: JSON.stringify({ data: formattedData })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Server returned an error.');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fileName = `nexventory_export_${new Date().toISOString().slice(0, 10)}.csv`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
        displayMessage('File download has started.', 'success', 'report-message-box');

    } catch (error) {
        displayMessage(`Export failed: ${error.message}`, 'error', 'report-message-box');
    } finally {
        hideSpinner(exportBtn);
    }
}

// in public/admin-settings.js

async function handleMasterAdminChange() {
    const emailInput = document.getElementById('newMasterAdminEmail');
    const newMasterAdminEmail = emailInput.value.trim();

    if (!newMasterAdminEmail) {
        return displayMessage('Please enter the email address of the new Master Admin.', 'error', 'system-tools-message-box');
    }

    const confirmationMessage = `
        <p>Are you sure you want to transfer the Master Admin role to <strong>${newMasterAdminEmail}</strong>?</p>
        <p style="color: var(--error-color);">This action cannot be undone. You will be demoted to a regular Admin and will lose access to this tool.</p>
    `;

    showConfirmationModal('Confirm Master Admin Transfer', confirmationMessage, async () => {
        const btn = document.getElementById('changeMasterAdminBtn');
        showSpinner(btn);
        displayMessage('Processing transfer...', 'info', 'system-tools-message-box');

        try {
            const response = await apiFetch('/api/changeMasterAdmin', {
                method: 'POST',
                body: JSON.stringify({ newMasterAdminEmail })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            displayMessage(result.message, 'success', 'system-tools-message-box');
            emailInput.value = '';
            // After a successful transfer, it's a good idea to refresh the page to reflect the user's new (demoted) role.
            setTimeout(() => window.location.reload(), 3000);

        } catch (error) {
            displayMessage(`Error: ${error.message}`, 'error', 'system-tools-message-box');
        } finally {
            hideSpinner(btn);
        }
    });
}