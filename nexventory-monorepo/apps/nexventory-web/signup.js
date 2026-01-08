// public/signup.js

function onAuthReady(user) {
    // If a user is already logged in, redirect them to the dashboard.
    if (user) {
        window.location.href = '/';
    }
    // Ensure preloader is hidden for users arriving on this page directly.
    hideAppPreloader(); 
}

document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', handleCreateOrganization);
    }
});

/**
 * Handles the submission of the new organization form.
 * @param {Event} e The form submission event.
 */
async function handleCreateOrganization(e) {
    e.preventDefault();
    const createBtn = document.getElementById('createOrgBtn');
    const msgBox = document.getElementById('signup-message-box');

    const payload = {
        orgName: document.getElementById('orgName').value.trim(),
        fullName: document.getElementById('fullName').value.trim(),
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value,
        department: document.getElementById('department').value.trim()
    };

    if (!payload.orgName || !payload.fullName || !payload.email || !payload.password || !payload.department) {
        displayMessage('All fields are required.', 'error', 'signup-message-box');
        return;
    }
    if (payload.password.length < 6) {
        displayMessage('Password must be at least 6 characters long.', 'error', 'signup-message-box');
        return;
    }

    showSpinner(createBtn);

    try {
        const response = await fetch('/api/createNewOrganization', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'An unknown error occurred.');
        }

        displayMessage(result.message, 'success', 'signup-message-box');
        
        // After successful creation, sign the user in automatically
        await firebase.auth().signInWithEmailAndPassword(payload.email, payload.password);
        
        // Redirect to dashboard on successful login after creation
        window.location.href = '/';

    } catch (error) {
        console.error('Organization creation failed:', error);
        displayMessage(`Error: ${error.message}`, 'error', 'signup-message-box');
    } finally {
        hideSpinner(createBtn);
    }
}