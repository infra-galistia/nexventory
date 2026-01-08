// /public/profile.js

function onAuthReady(user) {
    if (user) {
        fetchProfileData(); // No need to pass user, apiFetch will handle it
    } else {
        document.getElementById('profile-loader').style.display = 'none';
        const container = document.getElementById('profile-container');
        container.innerHTML = '<h2>Please Sign In</h2><p>You must be signed in to view your profile.</p>';
        container.style.display = 'block';
        hideAppPreloader();
    }
}

async function fetchProfileData() {
    const loader = document.getElementById('profile-loader');
    const container = document.getElementById('profile-container');
    try {
        loader.style.display = 'flex';
        
        // --- UPDATED: Use apiFetch ---
        const response = await apiFetch('/api/getUserProfileData', { method: 'POST', body: JSON.stringify({}) });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to fetch profile.');
        }

        const data = await response.json();
        renderProfile(data);
        
        loader.style.display = 'none';
        container.style.display = 'block';

    } catch (error) {
        loader.style.display = 'none';
        container.innerHTML = `<div class="message-box error">${error.message}</div>`;
        container.style.display = 'block';
    } finally {
        hideAppPreloader();
    }
}

function renderProfile(data) {
    const container = document.getElementById('profile-container');
    
    const permissionsHtml = data.permissions && Object.keys(data.permissions).length > 0
        ? Object.entries(data.permissions).map(([key, value]) => `
            <li class="user-list-item" style="padding: 8px 12px;">
                <span style="font-weight: 500;">${key}</span>
                <span class="status-badge ${value ? 'approved' : 'denied'}">${value ? 'Allowed' : 'Denied'}</span>
            </li>`).join('')
        : '<li class="user-list-item" style="justify-content: center;">No specific permissions assigned.</li>';

    container.innerHTML = `
        <div id="profile-message-box" class="message-box" style="display: none; margin-bottom: 1.5rem;"></div>
        <div class="user-management-grid">
            <div class="tool-card">
                <h4><i class="fas fa-user-circle"></i> My Details</h4>
                <ul class="detail-list">
                    <li>
                        <span class="label">Name:</span> 
                        <span class="value" id="displayNameContainer">
                            <span id="displayNameText">${data.displayName || 'N/A'}</span>
                            <i id="editNameBtn" class="fas fa-pencil-alt" style="cursor:pointer; margin-left:10px; color:var(--primary-color);"></i>
                        </span>
                    </li>
                    <li><span class="label">Email:</span> <span class="value">${data.email || 'N/A'}</span></li>
                    <li><span class="label">Role:</span> <span class="value">${data.role || 'N/A'}</span></li>
                    <li><span class="label">Department:</span> <span class="value">${data.department || 'N/A'}</span></li>
                </ul>
            </div>
            <div class="tool-card">
                <h4><i class="fas fa-shield-alt"></i> Effective Permissions</h4>
                <p style="font-size: 0.9em; color: #666;">This is the final list of actions you are allowed to perform.</p>
                <ul class="user-list" style="margin-top: 1rem; max-height: 300px;">
                    ${permissionsHtml}
                </ul>
            </div>
        </div>
    `;
    
    document.getElementById('editNameBtn').addEventListener('click', () => {
        const container = document.getElementById('displayNameContainer');
        const currentName = document.getElementById('displayNameText').textContent;
        container.innerHTML = `
            <input type="text" id="editNameInput" class="form-control" value="${currentName}" style="flex-grow: 1;">
            <button id="saveNameBtn" class="btn btn-success btn-sm">Save</button>
            <button id="cancelNameBtn" class="btn btn-secondary btn-sm">Cancel</button>
        `;
        document.getElementById('saveNameBtn').addEventListener('click', handleSaveProfile);
        document.getElementById('cancelNameBtn').addEventListener('click', fetchProfileData);
    });
}

async function handleSaveProfile() {
    const newName = document.getElementById('editNameInput').value.trim();
    if (!newName) {
        displayMessage('Name cannot be empty.', 'error', 'profile-message-box');
        return;
    }
    
    const saveBtn = document.getElementById('saveNameBtn');
    showSpinner(saveBtn);
    
    try {
        const response = await apiFetch('/api/updateUserProfile', {
            method: 'POST',
            body: JSON.stringify({ displayName: newName })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        const user = firebase.auth().currentUser;
        if (user) {
            await user.updateProfile({ displayName: newName });
        }
        
        // --- THIS IS THE FIX ---
        // 1. Call the global helper function to update the top bar instantly.
        updateTopBarUserName(newName);
        // 2. We no longer need to reload all the navigation.
        // --- END OF FIX ---

        displayMessage(result.message, 'success', 'profile-message-box');
        fetchProfileData(); // This reloads the profile details card

    } catch (error) {
        displayMessage(`Error: ${error.message}`, 'error', 'profile-message-box');
        fetchProfileData(); // Reload profile details even on error
    }
}