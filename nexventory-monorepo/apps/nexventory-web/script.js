/// public/script.js
// Contains global JavaScript functions shared across the entire application.
// This version is corrected for use with the Firebase Local Emulator Suite.

// --- 1. GLOBAL STATE & CACHE ---
let html5QrCode;
let isScannerActive = false;
let pageDataCache = {}; 
let onConfirmCallback;
let chatbotInstance; 
window.sessionInfo = {};

const AppConfig = {
    features: {
        studentsEnabled: false // This should be false
    },
    security: {
        allowedDomains: ['@oldscollege.ca', '@example.com']
    }
};

// --- NEW: API Fetch Helper ---
/**
 * A global helper for making authenticated API calls.
 * Automatically includes the user's auth token and organizationId.
 * @param {string} endpoint The API endpoint (e.g., '/api/getData').
 * @param {object} options Standard fetch options (method, body, etc.).
 * @returns {Promise<Response>} The fetch response promise.
 */


async function apiFetch(endpoint, options = {}) {
    // FIX: Use firebase.auth() instead of 'auth' variable
    const user = firebase.auth().currentUser; 
    if (!user) {
        throw new Error('User not authenticated.');
    }

    const token = await user.getIdToken();
    const { organizationId } = window.sessionInfo;

    // Check if the app is running locally on the hosting emulator port
    const isEmulator = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // If it's the emulator, build the full, direct URL to the functions emulator.
    const apiBaseUrl = isEmulator 
        ? 'http://127.0.0.1:5001/nexventory/us-central1' 
        : ''; 

    const finalEndpoint = `${apiBaseUrl}${endpoint}`;

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    let body = options.body ? JSON.parse(options.body) : {};
    if (endpoint !== '/api/createNewOrganization') {
        body.organizationId = organizationId;
    }
    
    const method = options.method || 'POST';

    return fetch(finalEndpoint, {
        ...options,
        method,
        headers,
        body: JSON.stringify(body)
    });
}
  


// --- 2. INITIALIZATION ---
async function loadChatbot() {
    const container = document.getElementById('chatbot-container');
    if (container) {
        try {
            const response = await fetch('/chatbot.html');
            if (response.ok) {
                container.innerHTML = await response.text();
            } else {
                console.error('Failed to load chatbot HTML.');
            }
        } catch (error) {
            console.error('Error fetching chatbot HTML:', error);
        }
    }
}

  document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();

    const appWrapper = document.querySelector('.app-wrapper');
    const primaryBrandLogin = document.getElementById('primary-brand-login');
    const loginBtn = document.getElementById("google-signin-btn");

    // --- 1. Attach Login Listener IMMEDIATELY ---
    // We do this first so the button works even if the auth check takes a moment.
    if (loginBtn) {
        loginBtn.addEventListener("click", async (e) => {
            e.preventDefault(); // Prevents default button behavior
            console.log("Sign In Button Clicked...");
            
            const provider = new firebase.auth.GoogleAuthProvider();
            try {
                // FIX: Use 'firebase.auth()' explicitly to avoid reference errors
                await firebase.auth().signInWithPopup(provider);
                console.log("Sign In Popup Finished.");
            } catch (error) {
                console.error("Login Failed:", error);
                alert("Login failed: " + error.message);
            }
        });
    }
    
    // --- 2. Auth State Observer ---
    try {
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                // --- USER IS LOGGED IN ---
                console.log("User detected:", user.email);

                // Security Check
                const isAllowed = AppConfig.security.allowedDomains.some(domain => user.email.endsWith(domain));
                if (!isAllowed) {
                    alert(`Access denied. This application is restricted to users from: ${AppConfig.security.allowedDomains.join(', ')}`);
                    firebase.auth().signOut();
                    return;
                }
                
                // SHOW APP / HIDE LOGIN
                if (primaryBrandLogin) primaryBrandLogin.style.display = 'none';
                if (appWrapper) appWrapper.style.display = 'block'; 
                
                // Safe to initialize app data now
                initializeApp(user);

            } else {
                // --- USER IS LOGGED OUT ---
                console.log("No user logged in.");

                // SHOW LOGIN / HIDE APP
                if (primaryBrandLogin) primaryBrandLogin.style.display = 'flex';
                if (appWrapper) appWrapper.style.display = 'none';
                
                // FIX: Removed 'initializeApp(null)' to prevent it from fetching data and crashing.
                
                // Redirect logic
                const currentPage = window.location.pathname;
                if (currentPage !== '/index.html' && currentPage !== '/') {
                    window.location.href = '/index.html';
                }
            }
            hideAppPreloader();
        });
    } catch (e) {
        console.error("Fatal Error: Could not initialize Firebase.", e);
        hideAppPreloader();
        // Fallback to showing login screen on error
        if (primaryBrandLogin) primaryBrandLogin.style.display = 'flex';
        if (appWrapper) appWrapper.style.display = 'none';
    }
});

async function getSessionWithRetry(retries = 3, delay = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await apiFetch('/api/getSessionInfo');
      if (response.ok) {
        return await response.json(); // Success, return the data
      }
      if (response.status === 404) {
        console.log(`Session info not found (user record might be creating), retrying... (${i + 1}/${retries})`);
        await new Promise(res => setTimeout(res, delay)); // Wait before trying again
      } else {
        // For other server errors (like 500), throw immediately
        throw new Error(`Server responded with status ${response.status}`);
      }
    } catch (error) {
      if (i === retries - 1) throw error; // Rethrow on the last attempt
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error('Could not fetch session info after multiple retries.');
}

async function initializeApp(user) {
    const currentUser = firebase.auth().currentUser || user;
    
    if (currentUser) {
        console.log('Currently Logged In User:', currentUser.email, 'UID:', currentUser.uid);
    }
    
    try {
        const data = await getSessionWithRetry();
        window.sessionInfo = data.success ? data : { role: 'Public' };
    } catch (error) {
        console.error('Could not fetch session info:', error);
        window.sessionInfo = { role: 'Public' }; // Fallback
    }

    // --- THIS IS THE CRITICAL SECURITY CHECK ---
    if (window.sessionInfo.status === 'pending') {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.innerHTML = `
                <div class="content-block" style="text-align: center;">
                    <h2>Account Pending Approval</h2>
                    <p>Your request to join this organization has been received. An administrator will review your request shortly. Please check back later.</p>
                </div>
            `;
        }
        initializeNavigation(currentUser, window.sessionInfo);
        setupGlobalEventListeners(currentUser);
        hideAppPreloader();
         
        return; 
    }
    // --- END OF SECURITY CHECK ---

    initializeNavigation(currentUser, window.sessionInfo);
    setupGlobalEventListeners(currentUser);
renderFooter();
    loadChatbot(); 

    if (typeof onAuthReady === 'function') {
        onAuthReady(currentUser);
    } else {
        hideAppPreloader();
    }
}
// --- THEME SWITCHER LOGIC ---
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    // This listener is specific to the theme button, which might not exist yet,
    // so we attach it to the document and check the target.
    document.addEventListener('click', (e) => {
        if (e.target.closest('#theme-toggle-btn')) {
            e.preventDefault();
            const currentTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(newTheme);
            localStorage.setItem('theme', newTheme);
        }
    });
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

function initializeNavigation(user, sessionInfo) {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const topNavContainer = document.getElementById('top-nav-links');
    const userContainer = document.getElementById('top-bar-user-container');
    const sidebarContainer = document.getElementById('sidebar-content');
    const sidebar = document.getElementById('app-sidebar');

    if (sidebar) {
        sidebar.classList.add('collapsed');
    }
    
    if (topNavContainer) {
        let topNavLinks = []; 
        
        // This check prevents pending users from seeing nav links
        if (sessionInfo.status !== 'pending') { 
            topNavLinks = [
                { name: 'Home', page: 'index.html' },
                { name: 'Check In/Out', page: 'operations.html' },
                { name: 'Inventory Hub', page: 'inventory-hub.html' },
                { name: 'Search', page: 'search.html' }
            ];
            if (sessionInfo && (sessionInfo.role === 'Admin' || sessionInfo.role === 'Master Admin')) {
                topNavLinks.push({ name: 'Settings', page: 'admin-settings.html' });
            }
        }
        
        topNavContainer.innerHTML = topNavLinks.map(link => {
            const isActive = (currentPage === link.page) ? 'active' : '';
            return `<a href="/${link.page}" class="${isActive}">${link.name}</a>`;
        }).join('');
    }

    if (userContainer) {
        if (user) {
            const userName = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
            userContainer.innerHTML = `
                <div class="user-profile-container">
                    <div class="user-profile-toggle" id="user-profile-toggle" title="User Menu">
                        <span class="user-avatar"><i class="fas fa-user"></i></span>
                        <span class="user-name">${userName}</span>
                    </div>
                    <div class="profile-dropdown-menu" id="profile-dropdown-menu">
                        <a href="/profile.html"><i class="fas fa-user-cog"></i> My Profile</a>
                        <a href="#" id="theme-toggle-btn"><i class="fas fa-adjust"></i> Toggle Theme</a>
                        <a href="#" id="logoutBtn"><i class="fas fa-sign-out-alt"></i> Sign Out</a>
                    </div>
                </div>
            `;
        } else {
             userContainer.innerHTML = `<a href="#" id="loginBtn" class="btn">Sign In with Google</a>`;
        }
    }

    if (sidebarContainer) {
        sidebarContainer.innerHTML = sidebarContent[currentPage] || sidebarContent['default'];
        if ((!sidebarContent[currentPage] || currentPage === 'index.html') && sessionInfo.status !== 'pending') {
            const sidebarLinksContainer = document.getElementById('sidebar-links-container');
            const topNavLinks = Array.from(topNavContainer.querySelectorAll('a'));
            if (sidebarLinksContainer && topNavLinks.length > 0) {
                sidebarLinksContainer.innerHTML = topNavLinks.map(link => {
                    const pageName = link.getAttribute('href').replace('/', '');
                    let iconClass = 'fa-link';
                    if (pageName.includes('index.html')) iconClass = 'fa-home';
                    if (pageName.includes('operations.html')) iconClass = 'fa-exchange-alt';
                    if (pageName.includes('inventory-hub.html')) iconClass = 'fa-box-open';
                    if (pageName.includes('search.html')) iconClass = 'fa-search';
                    if (pageName.includes('admin-settings.html')) iconClass = 'fa-user-shield';
                    return `<li><a href="${link.getAttribute('href')}" class="nav-link ${link.classList.contains('active') ? 'active' : ''}"><i class="fas ${iconClass}"></i><span class="link-text">${link.textContent}</span></a></li>`;
                }).join('');
            }
        }
    }
}

function setupGlobalEventListeners(user) {
    // --- Login/Logout & Dropdown Buttons ---
    // These listeners are attached based on whether a user is signed in.

    if (user) {
        // If the user is logged in, set up the logout and dropdown toggle
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    signOut(auth);
});
}
        const profileToggle = document.getElementById('user-profile-toggle');
        if (profileToggle) {
            profileToggle.addEventListener('click', (e) => {
                // This stops the click from immediately being caught by the document listener below
                e.stopPropagation(); 
                document.getElementById('profile-dropdown-menu').classList.toggle('active');
            });
        }
    } else {
        // If no user, set up the login button
        const loginBtn = document.getElementById('google-signin-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const provider = new GoogleAuthProvider();
                signInWithPopup(auth, provider).catch(error => console.error("Sign-in failed", error));
            });
        }
    }

    // --- Sidebar Toggle Button ---
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('app-sidebar')?.classList.toggle('collapsed');
        });
    }

    // --- Close Dropdown on Outside Click ---
    // This listens for any click on the page
    document.addEventListener('click', () => {
        const dropdown = document.getElementById('profile-dropdown-menu');
        // If the dropdown exists and is active, this will close it.
        if (dropdown && dropdown.classList.contains('active')) {
            dropdown.classList.remove('active');
        }
    });

    // --- Modal Close Buttons (using a single listener for all 'x' buttons) ---
    document.body.addEventListener('click', (e) => {
        if (e.target.matches('.modal-close')) {
            const modal = e.target.closest('.modal');
            if (modal) {
                // If it's the scan modal, also stop the camera
                if (modal.id === 'scanModal' && typeof stopActiveScanner === 'function') {
                    stopActiveScanner();
                }
                modal.classList.remove('active');
            }
        }
    });
}

function renderFooter() {
    const footer = document.getElementById('app-footer');
    if (footer) {
        footer.innerHTML = `
            <span>&copy; ${new Date().getFullYear()} NexVentory</span>
            <nav>
                <a href="/about.html">About</a>
                <a href="/privacy.html">Privacy Policy</a>
                <a href="/contact.html">Contact Us</a>
            </nav>
        `;
    }
}

// --- 3. PRELOADER & UI HELPERS ---
function hideAppPreloader() {
  const preloader = document.getElementById('preloader');
  if (preloader) {
    preloader.classList.add('hidden');
    setTimeout(() => { if(preloader) preloader.style.display = 'none'; }, 500);
  }
}

function displayMessage(message, type, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.className = `message-box ${type}`;
  container.innerHTML = message;
  container.style.display = 'block';
  setTimeout(() => { container.style.display = 'none'; }, 5000);
}

function showSpinner(button) {
  if (button) {
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = '<span class="spinner"></span> Processing...';
    button.disabled = true;
  }
}

function hideSpinner(button) {
  if (button) {
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    button.disabled = false;
  }
}

// --- 4. AUTH & NAVIGATION SETUP ---
function setupEventListeners(user) {
    const loginBtn = document.getElementById('google-signin-btn'); // Matches the new ID in index.html
    const logoutBtn = document.getElementById('logoutBtn');
    const navToggleIcon = document.getElementById('navToggleIcon');

    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // FIX: Use firebase.auth namespace
            const provider = new firebase.auth.GoogleAuthProvider();
            firebase.auth().signInWithPopup(provider)
                .then(() => {
                    console.log("Sign-in successful");
                    // The onAuthStateChanged listener will handle the UI switch
                })
                .catch(error => {
                    console.error("Sign-in failed", error);
                    alert("Login failed: " + error.message);
                });
        });
    }
   
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        firebase.auth().signOut().then(() => {
            // This line will now execute after a hard refresh
            window.location.href = '/index.html';
        });
    });
}
    if (navToggleIcon) {
        navToggleIcon.addEventListener('click', () => {
            document.getElementById('myTopnav').classList.toggle('responsive');
        });
    }

    const profileToggle = document.getElementById('user-profile-toggle');
    if (profileToggle) {
        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('profile-dropdown-menu').classList.toggle('active');
        });
    }
    
    const footer = document.getElementById('app-footer');
    if (footer) {
        footer.style.cssText = "background-color: #1e1e1e; padding: 1rem 0; text-align: center; font-size: 0.9rem; color: #ccc; margin-top: 2rem;";
        footer.innerHTML = `
            <div>&copy; <span id="footerYear">${new Date().getFullYear()}</span> NexVentory</div>
            <div style="margin-top: 0.5rem; display: flex; justify-content: center; gap: 15px; flex-wrap: wrap;">
                <a href="/about.html" style="color: #4dabf7;">About</a>
                <a href="/privacy.html" style="color: #4dabf7;">Privacy Policy</a>
                <a href="/contact.html" style="color: #4dabf7;">Contact Us</a>
                <a href="#" id="report-issue-link" style="color: #ff4757;">Report an Issue</a>
            </div>
        `;
    }

    const reportIssueLink = document.getElementById('report-issue-link');
    if (reportIssueLink) {
        reportIssueLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (chatbotInstance) {
                if (!chatbotInstance.isOpen) chatbotInstance.toggleChat();
                chatbotInstance.sendQuickMessage('Give Feedback');
            }
        });
    }
  
    const footerYear = document.getElementById("footerYear");
    if (footerYear) footerYear.textContent = new Date().getFullYear();
  
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal && modal.id === 'scanModal') stopActiveScanner();
            if(modal) modal.classList.remove('active');
        });
    });
}

// --- DYNAMIC SIDEBAR CONTENT ---
// This object maps each page to the HTML content for its sidebar.
const sidebarContent = {
    'default': `
        <div class="sidebar-section">
            <h4 class="sidebar-section-title"><span class="link-text">Navigation</span></h4>
            <ul class="nav-links" id="sidebar-links-container">
                </ul>
        </div>
    `,
    'search.html': `
        <div class="sidebar-section">
            <h4 class="sidebar-section-title"><span class="link-text">Filters</span></h4>
            <div class="link-text" style="padding: 0 1.5rem;">
                <div class="form-group">
                    <label for="filter-status">Status</label>
                    <select id="filter-status" class="form-control"><option value="">All</option><option value="Available">Available</option><option value="Out">Checked Out</option></select>
                </div>
                <div class="form-group">
                    <label for="filter-dept">Department</label>
                    <select id="filter-dept" class="form-control"><option value="">All</option></select>
                </div>
            </div>
        </div>
    `,
    'operations.html': `
         <div class="sidebar-section">
            <h4 class="sidebar-section-title"><span class="link-text">Operations</span></h4>
            <ul class="nav-links">
                <li><a href="#" class="nav-link" data-view="Checkout"><i class="fas fa-arrow-up"></i> <span class="link-text">Check Out</span></a></li>
                <li><a href="#" class="nav-link" data-view="CheckIn"><i class="fas fa-arrow-down"></i> <span class="link-text">Check In</span></a></li>
                <li><a href="#" class="nav-link" data-view="Intradepartment"><i class="fas fa-exchange-alt"></i> <span class="link-text">Intra-Department</span></a></li>
                <li><a href="#" class="nav-link" data-view="LostDamage"><i class="fas fa-heart-crack"></i> <span class="link-text">Lost / Damaged</span></a></li>
            </ul>
        </div>
    `,
    'admin-settings.html': `
       <div class="sidebar-section">
            <h4 class="sidebar-section-title"><span class="link-text">Settings</span></h4>
            <ul class="nav-links">
                <li><a href="#" class="nav-link" data-view="UserManagement"><i class="fas fa-users-cog"></i> <span class="link-text">User Management</span></a></li>
                <li><a href="#" class="nav-link" data-view="UserDatabases"><i class="fas fa-database"></i> <span class="link-text">User Databases</span></a></li>
                <li><a href="#" class="nav-link" data-view="DepartmentMappings"><i class="fas fa-building"></i> <span class="link-text">Department Mappings</span></a></li>
                <li><a href="#" class="nav-link" data-view="SystemTools"><i class="fas fa-cogs"></i> <span class="link-text">System Tools</span></a></li>
                <li><a href="#" class="nav-link" data-view="DataReporting"><i class="fas fa-chart-bar"></i> <span class="link-text">Data & Reporting</span></a></li>
            </ul>
        </div>
    `,

    'inventory-hub.html': `
       <div class="sidebar-section">
        <h4 class="sidebar-section-title"><span class="link-text">Inventory Areas</span></h4>
        <ul class="nav-links" id="hub-sidebar-links">
            </ul>
    </div>
`,
    'profile.html': `
        <div class="sidebar-section">
            <h4 class="sidebar-section-title"><span class="link-text">My Profile</span></h4>
            <ul class="nav-links">
                <li><a href="#" id="profile-view-details" class="nav-link"><i class="fas fa-user-edit"></i> <span class="link-text">Edit Details</span></a></li>
                <li><a href="#" id="profile-view-history" class="nav-link"><i class="fas fa-history"></i> <span class="link-text">My History</span></a></li>
            </ul>
        </div>
    `
};
      	


function setupQuickNavMenu() {
    const fab = document.getElementById('quickNavFab');
    const menu = document.getElementById('quickNavMenu');
    if (!fab || !menu) return;
    fab.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('active'); });
    document.addEventListener('click', (e) => { if (!fab.contains(e.target) && !menu.contains(e.target)) { menu.classList.remove('active'); } });
    const quickLinks = [
      { name: 'Home', icon: 'fa-home', page: 'index.html' },
      { name: 'Check Out', icon: 'fa-arrow-up', page: 'operations.html', view: 'Checkout' },
      { name: 'Check In', icon: 'fa-arrow-down', page: 'operations.html', view: 'CheckIn' },
      { name: 'Search', icon: 'fa-search', page: 'search.html' },
    ];
    menu.innerHTML = '';
    quickLinks.forEach(link => {
        let href = `/${link.page}`;
        if (link.view) href += `?view=${link.view}`;
        const a = document.createElement('a');
        a.href = href;
        a.innerHTML = `<i class="fas ${link.icon}"></i> ${link.name}`;
        const li = document.createElement('li');
        li.appendChild(a);
        menu.appendChild(li);
    });
}


// --- 5. GLOBAL MODAL, SCANNER, and RENDER FUNCTIONS ---
function showConfirmationModal(title, content, onConfirm) {
  const modal = document.getElementById('confirmationModal');
  if (modal) {
    document.getElementById('confirmationTitle').innerHTML = title;
    document.getElementById('confirmationMessage').innerHTML = content;
    modal.classList.add('active');
    onConfirmCallback = onConfirm;
    document.getElementById('proceedConfirmBtn').onclick = () => {
        if (typeof onConfirmCallback === 'function') onConfirmCallback();
        modal.classList.remove('active');
    };
    document.getElementById('cancelConfirmBtn').onclick = () => modal.classList.remove('active');
  }
}


/**
 * Handles the "Scan" button click, opening a modal with a camera feed.
 * This version uses a stable layered UI and optimized scanning.
 * @param {function} callback The function to call with the successfully scanned item.
 */
function handleScanClick(callback) {
    if (isScannerActive) {
        return;
    }
    const scanModal = document.getElementById('scanModal');
    const qrReaderDiv = document.getElementById('qr-reader');
    if (!scanModal || !qrReaderDiv) return;

    qrReaderDiv.innerHTML = ""; // Ensure the container is clean for the library

    const onScanSuccess = (decodedText, decodedResult) => {
        scanModal.classList.remove('active');
        stopActiveScanner().then(() => {
            let barcode = decodedText;
            if (decodedText.includes('barcode=')) {
                try { 
                    const url = new URL(decodedText);
                    barcode = url.searchParams.get("barcode"); 
                } catch (e) {}
            }
            if (barcode) {
                const sourceCache = (window.pageDataCache && window.pageDataCache.allItems) || [];
                const item = sourceCache.find(i => 
                    String(i.Barcode || i.id).trim().toLowerCase() === String(barcode).trim().toLowerCase()
                );
                if (item) {
                    callback(item);
                } else {
                    alert(`Item with barcode "${barcode}" not found.`);
                }
            }
        });
    };

    scanModal.classList.add('active');
    html5QrCode = new Html5Qrcode("qr-reader");
    isScannerActive = true;

    // This config tells the library where to look, but the visual box is handled by CSS.
    const config = {
        fps: 10,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            return { width: minEdge * 0.7, height: minEdge * 0.7 };
        },
        formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128
        ]
    };

    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, () => {})
        .catch(err => {
            console.error("Camera failed to start.", err);
            isScannerActive = false;
            scanModal.classList.remove('active');
        });
}

function stopActiveScanner() {
    return new Promise((resolve) => {
        if (!isScannerActive || !html5QrCode) { resolve(); return; }
        if (html5QrCode.getState() === 2) { // 2 is SCANNING state
            html5QrCode.stop().catch(err => console.error("Scanner .stop() failed.", err)).finally(() => {
                isScannerActive = false;
                html5QrCode = null;
                resolve();
            });
        } else {
            isScannerActive = false;
            html5QrCode = null;
            resolve();
        }
    });
}

/**
 * In public/script.js, replace the existing handleListAllClick function with this corrected version.
 * This function renders the list of all items in a modal.
 * CORRECTION: It now correctly displays the location by checking for `item.location` and falling back to `item.storageRoom`.
 */
function handleListAllClick(items, callback) {
    const modal = document.getElementById('listAllModal');
    const container = document.getElementById('listAllContainer');
    const filterInput = document.getElementById('listAllFilterInput');
    if (!modal || !container || !filterInput) return;

    const renderList = (filteredItems) => {
        container.innerHTML = '';
        if (filteredItems && filteredItems.length > 0) {
            filteredItems.forEach(item => {
                const div = document.createElement('div');
                div.className = 'list-item';
                
                // FIX: Use 'id' as the primary barcode/identifier
                const barcodeText = item.Barcode || item.id || 'undefined';
                const locationText = item.location || item.storageRoom || 'N/A';

                div.innerHTML = `
                    <strong>${item.itemName}</strong>
                    <small style="display: block; margin-top: 4px; color: #555;">
                        ${barcodeText} | Stock: ${item.currentStock}/${item.totalStock} | Location: ${locationText} | Status: ${item.loanStatus}
                    </small>
                `;
                div.onclick = () => {
                    if (typeof callback === 'function') {
                        const selected = items.find(i => i.id === item.id);
                        if (selected) {
                            callback(selected);
                            modal.classList.remove('active');
                        }
                    }
                };
                container.appendChild(div);
            });
        } else {
            container.innerHTML = `<div class="loading-placeholder">No items found.</div>`;
        }
    };
    
    filterInput.value = '';
    renderList(items);
    
    filterInput.oninput = () => {
        const query = filterInput.value.toLowerCase();
        const filtered = items.filter(i => 
            (i.itemName || '').toLowerCase().includes(query) || 
            (i.id || '').toLowerCase().includes(query) ||
            (i.Barcode || '').toLowerCase().includes(query)
        );
        renderList(filtered);
    };
    
    modal.classList.add('active');
}



function setupItemSelector(prefix, onSelect, getSourceCacheFunc) {
  const searchInput = document.getElementById(`${prefix}SearchInput`);
  const autocompleteList = document.getElementById(`${prefix}AutocompleteList`);
  if (!searchInput || !autocompleteList) return;
  
  searchInput.addEventListener('input', () => {
      const searchTerm = searchInput.value.toLowerCase();
      if (searchTerm.length < 2) { autocompleteList.style.display = 'none'; return; }
      const source = getSourceCacheFunc();
      
      // FIX: Use 'itemName' and 'id' to match Firestore data model
      const results = source.filter(item => 
        (item.itemName || '').toLowerCase().includes(searchTerm) ||
        (item.id || '').toLowerCase().includes(searchTerm) ||
        (item.Barcode || '').toLowerCase().includes(searchTerm)
      ).slice(0, 5);
      
      autocompleteList.innerHTML = results.map(item => `<div class="autocomplete-list-item" data-item-id="${item.id}"><strong>${item.itemName}</strong><small style="display: block; margin-top: 2px;">${item.id}</small></div>`).join('');
      autocompleteList.style.display = 'block';

      autocompleteList.querySelectorAll('.autocomplete-list-item').forEach(el => {
          el.addEventListener('click', () => {
              const selected = source.find(i => i.id === el.dataset.itemId);
              if (selected) onSelect(selected);
              searchInput.value = '';
              autocompleteList.style.display = 'none';
          });
      });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.form-group')) autocompleteList.style.display = 'none'; });
}

/**
 * In public/script.js, replace the existing showAutocomplete function with this corrected version.
 * This function renders the autocomplete suggestion list under search bars.
 * CORRECTION: Uses camelCase properties to match the Firebase API response.
 */
function showAutocomplete(results, listElement, inputElement, onSelectCallback) {
  listElement.innerHTML = '';
  listElement.style.display = 'block';
  if (results && results.length > 0) {
    results.forEach(item => {
      const div = document.createElement('div');
      div.className = 'autocomplete-list-item';
      // CORRECTED PROPERTY NAMES HERE
      div.innerHTML = `<strong>${item.itemName}</strong><small style="display: block; margin-top: 2px;">${item.Barcode} | Stock: ${item.currentStock}/${item.totalStock}</small>`;
      div.onclick = (e) => {
        e.stopPropagation();
        onSelectCallback(item);
        listElement.style.display = 'none';
        inputElement.value = '';
      };
      listElement.appendChild(div);
    });
  } else {
    listElement.innerHTML = `<div class="no-matches" style="padding:12px; color:#888;">No matches found.</div>`;
  }
}

/**
 * Renders the details for a selected item, including a correctly formatted location bar.
 * This is the corrected version.
 * @param {object} item - The full item object to display.
 * @param {string} containerId - The ID of the DOM element to render the details into.
 */
function renderSelectedItemDetails(item, containerId) {
    const wrapper = document.getElementById(containerId);
    if (!wrapper) return;
    wrapper.classList.remove('hidden');

    const imageUrl = item.imageUrl || 'https://placehold.co/400x400/eee/ccc?text=No+Image';

    // This logic correctly combines the storage room and location for display.
    let locationString = 'N/A';
    const storageRoom = item.storageRoom || '';
    const location = item.location || '';

    if (storageRoom && location) {
        locationString = `${storageRoom} / ${location}`;
    } else if (storageRoom || location) {
        locationString = storageRoom || location;
    }
    const hasLocation = locationString !== 'N/A';

    wrapper.innerHTML = `
        <h3>Item Details</h3>
        <div class="item-details-grid">
            <div class="item-image-placeholder">
                <img src="${imageUrl}" class="item-image" alt="Image of ${item.itemName || 'item'}" loading="lazy">
            </div>
            <div class="item-info-container">
                <ul class="detail-list">
                    <li><span class="label">Item Name:</span> <span class="value">${item.itemName || 'N/A'}</span></li>
                    <li><span class="label">Barcode:</span> <span class="value">${item.Barcode || 'N/A'}</span></li>
                    <li><span class="label">Stock:</span> <span class="value">${item.currentStock ?? '0'} / ${item.totalStock || '0'}</span></li>
                    <li><span class="label">Department:</span> <span class="value">${item.currentDepartment || 'N/A'}</span></li>
                    <li><span class="label">Status:</span> <span class="value">${item.loanStatus || 'N/A'}</span></li>
                </ul>
            </div>
        </div>
        <div class="location-bar ${hasLocation ? '' : 'hidden'}">
            <i class="fas fa-map-marker-alt"></i> <span>${locationString}</span>
        </div>
        <button type="button" class="btn visual-layout-toggle ${hasLocation ? '' : 'hidden'}">
            <i class="fas fa-eye"></i> Show Visual Location
        </button>
        <div class="visual-layout-container hidden">
             </div>`;
    
    const toggleBtn = wrapper.querySelector('.visual-layout-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => toggleVisualLayout(item, e.currentTarget));
    }
}

// --- 6. VISUAL LAYOUT & CAROUSEL FUNCTIONS ---

// in public/script.js

/**
 * Toggles the visibility of the visual layout grid.
 * MODIFIED to robustly handle both single items and arrays of items.
 * @param {object|Array<object>} itemsToHighlight - The item or items whose locations need to be shown.
 * @param {HTMLElement} btn - The button that was clicked.
 * @param {string} [layoutContainerId] - Optional ID for the visual layout container.
 */
function toggleVisualLayout(itemsToHighlight, btn, layoutContainerId = 'visual-layout-container') {
    if (!btn) return;
    // Find the parent container more robustly
    const parentContainer = btn.closest('.content-block, .manual-assembly-actions');
    if (!parentContainer) return;
    // Find the layout container, which could be a sibling or a child
    const container = parentContainer.nextElementSibling?.matches('.visual-layout-container') 
        ? parentContainer.nextElementSibling 
        : parentContainer.querySelector('.visual-layout-container');
    
    if (!container) return;

    const isHidden = container.classList.toggle('hidden');
    btn.innerHTML = isHidden ? '<i class="fas fa-eye"></i> Show Visual Location' : '<i class="fas fa-eye-slash"></i> Hide Visual Location';
        
    if (!isHidden) {
        container.innerHTML = `<div class="loading-placeholder"><span class="spinner"></span> Building Layout...</div>`;
        const layoutConfig = window.pageDataCache ? window.pageDataCache.layoutConfig : null;

        // --- THIS IS THE FIX ---
        // This line checks if the input is an array. If it's not (i.e., it's a single object),
        // it wraps it in an array before sending it to be rendered.
        const itemsArray = Array.isArray(itemsToHighlight) ? itemsToHighlight : [itemsToHighlight];
        
        renderVisualLayout(itemsArray, container, layoutConfig);
    }
}

/**
 * Renders the dynamic, scrollable visual layout grid and highlights specified items.
 * MODIFIED to accept and loop through an array of items.
 * @param {Array<object>} itemsToHighlight - The items to highlight on the grid.
 * @param {HTMLElement} gridContainerElement - The DOM element to render the grid into.
 * @param {object} layoutConfig - The configuration object with all zones and rows.
 */
function renderVisualLayout(itemsToHighlight, gridContainerElement, layoutConfig) {
    if (!gridContainerElement || !layoutConfig || !layoutConfig.zones || !layoutConfig.rows) {
        gridContainerElement.innerHTML = `<p style="text-align:center; color:#888;">Layout data is not available.</p>`;
        return;
    }
    
    // Client-side parser for consistency
    const _parseLocationStringForClient = (locationString) => {
        if (!locationString || typeof locationString !== 'string') return null;
        const str = locationString.trim();
        const delimiterIndex = str.indexOf(' - ');
        if (delimiterIndex !== -1) {
            const zone = str.substring(0, delimiterIndex).trim();
            const row = str.substring(delimiterIndex + 3).trim();
            if (zone && row) return { zone, row };
        }
        return null;
    };

    const allZones = layoutConfig.zones;
    const allRows = layoutConfig.rows;
    const roomName = itemsToHighlight[0]?.storageRoom || 'Layout';

    let tableHTML = `
        <h4 class="visual-layout-title">Layout for: ${roomName}</h4>
        <div class="visual-layout-wrapper">
            <table class="visual-layout-grid">
                <thead><tr><th>&nbsp;</th>${allZones.map(zone => `<th>${zone}</th>`).join('')}</tr></thead>
                <tbody>
                    ${allRows.map(rowName => `
                        <tr>
                            <th class="row-header">${rowName}</th>
                            ${allZones.map(zoneName => {
                                const cellId = `cell-${zoneName.replace(/[^a-zA-Z0-9-]/g, '')}-${rowName.replace(/[^a-zA-Z0-9-]/g, '')}`;
                                return `<td id="${cellId}"></td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
        
    gridContainerElement.innerHTML = tableHTML;

    // --- Highlighting and Smart Scrolling Logic for MULTIPLE items ---
    let firstCellToHighlight = null;
    itemsToHighlight.forEach(item => {
        const locationString = item.location || item.storageRoom;
        const parsedLocation = _parseLocationStringForClient(locationString);
        
        if (parsedLocation) {
            const { zone, row } = parsedLocation;
            const cellId = `cell-${zone.replace(/[^a-zA-Z0-9-]/g, '')}-${row.replace(/[^a-zA-Z0-9-]/g, '')}`;
            const cell = gridContainerElement.querySelector(`#${cellId}`);
            
            if (cell) {
                if (!firstCellToHighlight) firstCellToHighlight = cell;
                cell.classList.add('highlight');
                // Append barcodes to the cell, allowing multiple items in one location
                cell.innerHTML += `<span>${item.Barcode || item.barcode}</span>`;
            }
        }
    });

    // Scroll the first highlighted cell into view
    if (firstCellToHighlight) {
        setTimeout(() => {
            firstCellToHighlight.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }, 100);
    }
}


function setupCarousel(containerId, paginationId) {
  const carousel = document.getElementById(containerId);
  const pagination = document.getElementById(paginationId);
  if (!carousel || !pagination) return;

  const slides = carousel.children;
  if (slides.length <= 1) {
      pagination.style.display = 'none';
      return;
  }

  pagination.innerHTML = '';
  for (let i = 0; i < slides.length; i++) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      pagination.appendChild(dot);
  }
  const dots = pagination.children;
  if(dots.length > 0) dots[0].classList.add('active');

  let debounceTimer;
  carousel.addEventListener('scroll', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const scrollLeft = carousel.scrollLeft;
      const slideWidth = carousel.clientWidth;
      const activeIndex = Math.round(scrollLeft / slideWidth);
      
      for(let i = 0; i < dots.length; i++) {
        dots[i].classList.toggle('active', i === activeIndex);
      }
    }, 100);
  });
}


// PASTE THIS ENTIRE CLASS INTO SCRIPT.JS

// ==========================================================
// --- 7. Universal Chatbot Logic ---
// ==========================================================


// in public/script.js
// REPLACE your entire UniversalChatbot class with this one.
class UniversalChatbot {
    constructor(user, sessionInfo) {
        this.isOpen = false;
        this.user = user;
        this.sessionInfo = sessionInfo;
        this.conversationHistory = [];
        this.inventoryCache = null;
        this.dashboardDataCache = null;
        this.operationsDataCache = null;
        this.conversationState = {};
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.displayWelcomeOrNotification();
        this.setupKeyboardShortcuts();
        this.renderQuickActionButtons();
    }

  // This function sets up the click listener
setupEventListeners() {
    const toggle = document.getElementById('chat-toggle');
    const closeBtn = document.querySelector('.close-btn');
    const messageInput = document.getElementById('message-input');
    const quickActionsHeader = document.getElementById('quick-actions-header');

    if (toggle) toggle.addEventListener('click', () => this.toggleChat());
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeChat());
    
    if (messageInput) messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.sendMessage();
    });

    if (quickActionsHeader) {
        quickActionsHeader.addEventListener('click', () => this.toggleQuickActions());
    }
}

// This function performs the collapse/expand action
toggleQuickActions() {
    const buttons = document.getElementById('chatbot-action-buttons');
    const icon = document.getElementById('quick-actions-toggle-icon');
    if(buttons && icon) {
        buttons.classList.toggle('collapsed');
        icon.classList.toggle('collapsed');
    }
}

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'm') {
                e.preventDefault();
                this.toggleChat();
            }
        });
    }

    displayWelcomeOrNotification() {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;
        messagesContainer.innerHTML = '';
        let userName = 'Guest';
        if (this.user) {
            if (this.user.displayName) {
                userName = this.user.displayName.split(' ')[0];
            } else if (this.user.email) {
                userName = this.user.email.split('@')[0];
            }
        }
        const isAdmin = this.sessionInfo.role === 'Admin' || this.sessionInfo.role === 'Master Admin';
        const pendingCount = this.sessionInfo.pendingUserCount || 0;
        if (this.user && isAdmin && pendingCount > 0) {
            const badge = document.querySelector('#chatbot-widget .notification-badge');
            badge.textContent = pendingCount;
            badge.style.display = 'flex';
            const notificationHtml = `
                👋 Welcome back, <strong>${userName}</strong>!
                <br><br>
                You have <strong>${pendingCount} pending user request(s)</strong> that need your attention.
                <br><br>
                <button class="action-btn" onclick="window.location.href='/admin-settings.html'">View Requests</button>
            `;
            this.addMessage(notificationHtml, 'bot', true);
            if (!sessionStorage.getItem('chatNotificationShown')) {
                this.toggleChat();
                sessionStorage.setItem('chatNotificationShown', 'true');
            }
        } else if (this.user) {
            const welcomeText = `👋 Hi, <strong>${userName}</strong>! I'm your AI assistant for NexVentory. What can I help you with today?`;
            this.addMessage(welcomeText, 'bot', true);
        } else {
            const welcomeText = `👋 Welcome to NexVentory! Please sign in to use the app and the AI assistant.`;
            this.addMessage(welcomeText, 'bot', true);
        }
    }

   
// In script.js, inside the UniversalChatbot class
// REPLACE your existing renderQuickActionButtons function with this one

renderQuickActionButtons(actions = []) {
    const container = document.getElementById('chatbot-action-buttons');
    if (!container) return;

    // If a specific set of actions is passed (like during a conversation), use them.
    if (actions.length > 0) {
        container.innerHTML = actions.map(action =>
            `<button class="action-btn" onclick="chatbotInstance.sendQuickMessage('${action.message}')">${action.text}</button>`
        ).join('');
        return;
    }

    // Build the default list of actions based on user permissions.
    const defaultActions = [];
    const permissions = this.sessionInfo.userPermissions || {};
    const role = this.sessionInfo.role; // Get the user's role
    const isLoggedIn = !!this.user;

    const allPossibleActions = [
        { text: 'Search an Item', message: 'Search for ', permission: null },
        { text: 'Check Out', message: 'Check out an item', permission: null },
        { text: 'Check In', message: 'Check in an item', permission: null },
        { text: 'Inventory Hub', url: '/inventory-hub.html', permission: null },
        { text: 'Transfer Item', message: 'Transfer an item', permission: 'canTransfer' },
        { text: 'Log Lost/Damaged', message: 'Log a lost or damaged item', permission: 'canLogDamaged' },
        { text: 'Give Feedback', message: 'Give Feedback', permission: null } // ADD THIS LINE

    ];

    if (isLoggedIn) {
        allPossibleActions.forEach(action => {
            // --- THIS IS THE FIX ---
            // Show the button if:
            // 1. The user is a Master Admin (they can do everything).
            // 2. The action doesn't require a specific permission.
            // 3. The user has the specific permission.
            if (role === 'Master Admin' || !action.permission || permissions[action.permission]) {
                defaultActions.push(action);
            }
        });
    }

    // Render the final list of buttons.
    container.innerHTML = defaultActions.map(action => {
        if (action.url) {
            return `<a href="${action.url}" class="action-btn">${action.text}</a>`;
        } else {
            return `<button class="action-btn" onclick="chatbotInstance.sendQuickMessage('${action.message}')">${action.text}</button>`;
        }
    }).join('');
}

    toggleChat() {
        const chatWindow = document.getElementById('chat-window');
        const badge = document.querySelector('.notification-badge');
        if (this.isOpen) {
            this.closeChat();
        } else {
            if (chatWindow) chatWindow.classList.add('show');
            this.isOpen = true;
            if (badge) badge.style.display = 'none';
            document.getElementById('message-input')?.focus();
        }
    }

    closeChat() {
        document.getElementById('chat-window')?.classList.remove('show');
        this.isOpen = false;
    }

    sendMessage(messageText = null) {
        const input = document.getElementById('message-input');
        const text = messageText || input?.value.trim();
        if (!text) return;
        this.addMessage(text, 'user');
        if (input) input.value = '';
        this.showTypingIndicator();
        setTimeout(() => {
            this.hideTypingIndicator();
            this.processMessage(text);
        }, 1000);
    }

    sendQuickMessage(message) {
        if (!this.isOpen) this.toggleChat();
        if (message.endsWith(' ')) {
            const input = document.getElementById('message-input');
            input.value = message;
            input.focus();
        } else {
            this.sendMessage(message);
        }
    }

    addMessage(text, sender = 'bot', isHTML = false) {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        const avatar = sender === 'user' ? '👤' : '🤖';
        const escapedText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        messageDiv.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">${isHTML ? text : escapedText}</div>
        `;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        this.conversationHistory.push({ sender, text, timestamp: Date.now() });
    }


   async processMessage(message) {
        const msgLower = message.toLowerCase();

        // 1. Check for high-confidence keywords that START a NEW conversation.
        if (msgLower.startsWith('check out')) {
            this.conversationState = {};
            this.handleCheckoutIntent(message);
            return;
        }
        if (msgLower.startsWith('check in')) {
            this.conversationState = {};
            this.handleCheckinIntent(message);
            return;
        }
        if (msgLower.startsWith('transfer')) {
            this.conversationState = {};
            this.handleTransferIntent(message);
            return;
        }
        if (msgLower.startsWith('log')) {
            this.conversationState = {};
            this.handleLogStatusIntent(message);
            return;
        }
       if (msgLower.startsWith('log')) {
           this.conversationState = {}; // Reset state
           this.handleLogStatusIntent(message);
           return;
    }
    // ADD THIS ELSE IF BLOCK
    else if (msgLower.startsWith('give feedback')) {
        this.conversationState = {}; // Reset state
        this.handleFeedbackIntent(message);
        return;
    }

        // 2. If NOT a new command, CONTINUE the existing conversation.
        if (this.conversationState.currentAction) {
            switch (this.conversationState.currentAction) {
                case 'checkout': this.handleCheckoutIntent(message); break;
                case 'checkin': this.handleCheckinIntent(message); break;
                case 'transfer': this.handleTransferIntent(message); break;
                case 'logStatus': this.handleLogStatusIntent(message); break;
                case 'feedback': this.handleFeedbackIntent(message); break;
            }
            return;
        }
        
        // 3. If no conversation is active, check for other intents.
        if (msgLower.includes('how many') || msgLower.includes('summary') || msgLower.includes('stats')) {
            this.handleStatsIntent(msgLower);
            return;
        }

        // 4. If nothing else matches, assume it's a search query.
        let query = message.trim();
        if (msgLower.startsWith('search for ')) {
            query = message.substring(11);
        } else if (msgLower.startsWith('find ')) {
            query = message.substring(5);
        }
        this.handleSearchIntent(query);
    }

// In script.js, inside the UniversalChatbot class

async handleFeedbackIntent(message) {
    if (!this.conversationState.currentAction) {
        this.conversationState = {
            currentAction: 'feedback',
            step: 'getCategory',
        };
        this.addMessage("I'm happy to help with that. What is your feedback about?", 'bot');
        this.renderQuickActionButtons([
            { text: 'Chatbot Suggestion', message: 'Chatbot' },
            { text: 'Report a Bug', message: 'Bug Report' },
            { text: 'General Feedback', message: 'General' }
        ]);
        return;
    }

    const { step } = this.conversationState;

    switch(step) {
        case 'getCategory': {
            this.conversationState.category = message;
            this.conversationState.step = 'getComment';
            this.addMessage(`Okay, a <strong>${message}</strong>. Please provide as much detail as possible in your comment below.`, 'bot', true);
            this.renderQuickActionButtons([]);
            break;
        }
        case 'getComment': {
            this.conversationState.comment = message;
            this.conversationState.step = 'execute';
            this.addMessage("Thank you! I've recorded your feedback.", 'bot');
            this.handleFeedbackIntent(); // Proceed to execute
            break;
        }

        case 'execute': {
            try {
                const s = this.conversationState;
                const payload = {
                    category: s.category,
                    comment: s.comment,
                    userEmail: this.user ? this.user.email : 'Anonymous',
                    pageUrl: window.location.href
                };
                // --- UPDATED: Use the new apiFetch helper ---
                const response = await apiFetch('/api/submitFeedback', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                if (!response.ok) throw new Error('Server failed to save feedback.');
            } catch (error) {
                console.error('Feedback submission failed:', error);
            } finally {
                this.conversationState = {};
                this.renderQuickActionButtons();
            }
            break;
        }
    }
}



    // --- DATA FETCHING & CACHING ---
    async getInventoryCache() {
        if (this.inventoryCache) {
            return this.inventoryCache;
        }
        try {
            const response = await fetch('/api/getInventory');
            if (!response.ok) return [];
            this.inventoryCache = await response.json();
            return this.inventoryCache;
        } catch (e) {
            return [];
        }
    }

    async getDashboardDataCache() {
        if (this.dashboardDataCache) {
            return this.dashboardDataCache;
        }
        try {
            const response = await fetch('/api/getDashboardData');
            if (!response.ok) return null;
            this.dashboardDataCache = await response.json();
            return this.dashboardDataCache;
        } catch (e) {
            return null;
        }
    }


// In script.js, PASTE this entire block inside the UniversalChatbot class

async getOperationsDataCache() {
    if (this.operationsDataCache) {
        return this.operationsDataCache;
    }
    try {
        const response = await fetch('/api/getOperationsPageData');
        if (!response.ok) return null;
        this.operationsDataCache = await response.json();
        return this.operationsDataCache;
    } catch (e) {
        return null;
    }
}

// In script.js, inside the UniversalChatbot class
// REPLACE the existing handleCheckoutIntent function with this one

async handleCheckoutIntent(message) {
    if (!this.conversationState.currentAction) {
        // Start a new checkout conversation
        this.conversationState = {
            currentAction: 'checkout',
            step: 'getItem',
            item: null,
            quantity: 0,
            recipientType: null,
            recipient: null,
            purpose: null,
            dueDate: null // Added dueDate
        };
        this.addMessage("Sure, I can help check out an item. What is the barcode or name of the item?", 'bot');
        return;
    }

    const { step } = this.conversationState;

    switch (step) {
        case 'getItem':
            // ... (This case remains unchanged)
            const inventory = await this.getInventoryCache();
            const query = message.toLowerCase();
            const results = inventory.filter(item =>
                (item.itemName || '').toLowerCase().includes(query) ||
                (item.Barcode || '').toLowerCase().includes(query)
            );

            if (results.length === 1) {
                const item = results[0];
                if (item.currentStock < 1) {
                    this.addMessage(`I found <strong>${item.itemName}</strong>, but it is currently out of stock.`, 'bot', true);
                    this.conversationState = {};
                    this.renderQuickActionButtons();
                    return;
                }
                this.conversationState.item = item;
                this.conversationState.step = 'getQuantity';
                this.addMessage(`Found <strong>${item.itemName}</strong>. There are <strong>${item.currentStock}</strong> available. How many would you like to check out?`, 'bot', true);
            } else if (results.length > 1) {
                this.addMessage("I found a few items matching that. Please provide the exact barcode.", 'bot');
            } else {
                this.addMessage("I couldn't find that item. Please try a different name or barcode.", 'bot');
            }
            break;

        case 'getQuantity':
            // ... (This case remains unchanged)
            const qty = parseInt(message, 10);
            const stock = this.conversationState.item.currentStock;
            if (isNaN(qty) || qty <= 0) {
                this.addMessage("Please enter a valid number greater than zero.", 'bot');
                return;
            }
            if (qty > stock) {
                this.addMessage(`There are only <strong>${stock}</strong> available. Please enter a smaller quantity.`, 'bot', true);
                return;
            }
            this.conversationState.quantity = qty;
            this.conversationState.step = 'getRecipientType';
            this.addMessage(`Okay, ${qty}. Who are you checking this out to?`, 'bot');
            this.renderQuickActionButtons([
                { text: 'Staff', message: 'Staff' },
                { text: 'Student', message: 'Student' }
            ]);
            break;

        case 'getRecipientType':
            // ... (This case remains unchanged)
            this.conversationState.recipientType = message.toLowerCase();
            this.conversationState.step = 'getRecipient';
            this.addMessage(`Okay, a ${message}. Please type their name.`, 'bot');
            this.renderQuickActionButtons([]);
            break;

        case 'getRecipient':
            // ... (This case remains unchanged)
            const opsData = await this.getOperationsDataCache();
            const recipientQuery = message.toLowerCase();
            let recipientList = this.conversationState.recipientType === 'staff' ? opsData.staffList : opsData.studentList;
            const recipientResults = recipientList.filter(r => r.name.toLowerCase().includes(recipientQuery));

            if (recipientResults.length === 1) {
                this.conversationState.recipient = recipientResults[0];
                this.conversationState.step = 'getPurpose';
                const purposeData = await this.getOperationsDataCache();
                const purposeOptions = purposeData.dropdowns.Purpose.map(p => ({ text: p, message: p }));
                this.addMessage(`Got it. And what is the purpose of this checkout?`, 'bot');
                this.renderQuickActionButtons(purposeOptions);
            } else {
                this.addMessage(`I couldn't find a unique match for that name. Please be more specific.`, 'bot');
            }
            break;
        
        case 'getPurpose':
            this.conversationState.purpose = message;
            this.conversationState.step = 'getDueDate'; // PROCEED TO NEW STEP
            this.addMessage(`Okay, purpose is "${message}". When is this due back?`, 'bot');
            this.renderQuickActionButtons([
                { text: 'Tomorrow', message: 'Tomorrow' },
                { text: '1 Week', message: '1 Week' },
                { text: 'End of Month', message: 'End of Month' }
            ]);
            break;

        case 'getDueDate': // NEW STEP
            this.conversationState.dueDate = message;
            this.conversationState.step = 'confirm';
            this.addMessage(`Great. The due date is set for "${message}". Please confirm all details.`, 'bot');
            this.handleCheckoutIntent(); // Call again to show confirmation
            break;

        case 'confirm':
            const { item, recipient, quantity, purpose, dueDate } = this.conversationState;
            const confirmationHtml = `
                Please confirm: <br>
                <ul>
                    <li><strong>Item:</strong> ${item.itemName} (${item.Barcode})</li>
                    <li><strong>Quantity:</strong> ${quantity}</li>
                    <li><strong>To:</strong> ${recipient.name}</li>
                    <li><strong>Purpose:</strong> ${purpose}</li>
                    <li><strong>Due Date:</strong> ${dueDate}</li>
                </ul>
            `;
            this.addMessage(confirmationHtml, 'bot', true);
            this.renderQuickActionButtons([
                { text: 'Confirm Checkout', message: 'Confirm' },
                { text: 'Cancel', message: 'Cancel' }
            ]);
            this.conversationState.step = 'execute';
            break;

        case 'execute':
            if (message.toLowerCase() === 'confirm') {
                this.addMessage("Processing checkout...", 'bot');
                try {
                    const payload = {
                        items: [{ item: this.conversationState.item, quantity: this.conversationState.quantity }],
                        context: {
                            assignedTo: this.conversationState.recipient.name,
                            checkoutType: this.conversationState.recipientType,
                            purpose: this.conversationState.purpose,
                            dueDate: this.conversationState.dueDate,
                            user: this.user.email
                        }
                    };
                    // --- UPDATED: Use the new apiFetch helper ---
                    const response = await apiFetch('/api/processCheckout', {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });
                    
                    const result = await response.json();
                    if (!response.ok || !result.success) {
                        throw new Error(result.message || 'The server returned an error.');
                    }
                    this.addMessage("✅ Checkout complete! The transaction has been logged.", 'bot');
                } catch (error) {
                    this.addMessage(`⚠️ Checkout failed: ${error.message}`, 'bot');
                } finally {
                    this.conversationState = {};
                    this.renderQuickActionButtons();
                }
            } else {
                this.addMessage("Checkout cancelled.", 'bot');
                this.conversationState = {};
                this.renderQuickActionButtons();
            }
            break;
    }
}



// In script.js, inside the UniversalChatbot class
// REPLACE your existing handleCheckinIntent function with this one

async handleCheckinIntent(message) {
    if (!this.conversationState.currentAction) {
        this.conversationState = {
            currentAction: 'checkin',
            step: 'getItem',
            item: null,
            quantity: 0
        };
        this.addMessage("Okay, I can help check in an item. What is the barcode of the item you are returning?", 'bot');
        return;
    }

    const { step } = this.conversationState;

    switch (step) {
        case 'getItem': { // Added opening brace
            const inventory = await this.getInventoryCache();
            const query = message.toLowerCase().trim();
            const results = inventory.filter(item => (item.Barcode || '').toLowerCase() === query);

            if (results.length === 1) {
                const item = results[0];
                if (item.loanStatus !== 'Out') {
                    this.addMessage(`This item, <strong>${item.itemName}</strong>, is already marked as "In". No action needed.`, 'bot', true);
                    this.conversationState = {};
                    this.renderQuickActionButtons();
                    return;
                }
                
                const quantityOut = (item.totalStock || 0) - (item.currentStock || 0);
                this.conversationState.item = item;
                this.conversationState.quantity = quantityOut > 0 ? quantityOut : 1;
                this.conversationState.step = 'confirm';

                const assignedTo = item.assignedTo || 'an unknown user';
                this.addMessage(`Found <strong>${item.itemName}</strong>. It is currently checked out to <strong>${assignedTo}</strong> (Quantity: ${this.conversationState.quantity}). Are you sure you want to check it in?`, 'bot', true);
                this.renderQuickActionButtons([
                    { text: 'Yes, Check In', message: 'Confirm' },
                    { text: 'Cancel', message: 'Cancel' }
                ]);

            } else {
                this.addMessage("I couldn't find an item with that exact barcode. Please try again.", 'bot');
            }
            break;
        } // Added closing brace

        case 'confirm': { // Added opening brace
            this.conversationState.step = 'execute';
            this.handleCheckinIntent(message);
            break;
        } // Added closing brace

        case 'execute': {
            if (message.toLowerCase() === 'confirm') {
                this.addMessage("Processing check-in...", 'bot');
                try {
                    const payload = {
                        mode: 'individual',
                        itemBarcode: this.conversationState.item.Barcode,
                        quantity: this.conversationState.quantity,
                        notes: `Checked in via NexVentory Assistant by ${this.user.email}`
                    };
                    // --- UPDATED: Use the new apiFetch helper ---
                    const response = await apiFetch('/api/processCheckin', {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });
                    const result = await response.json();
                    if (!response.ok || !result.success) {
                        throw new Error(result.message || 'The server returned an error.');
                    }
                    this.addMessage("✅ Check-in complete!", 'bot');
                } catch (error) {
                    this.addMessage(`⚠️ Check-in failed: ${error.message}`, 'bot');
                } finally {
                    this.conversationState = {};
                    this.renderQuickActionButtons();
                }
            } else {
                // ... (cancel logic)
            }
            break;
        }
    }
}




// In script.js, inside the UniversalChatbot class
// REPLACE your existing handleTransferIntent function with this one

async handleTransferIntent(message) {
    if (!this.conversationState.currentAction) {
        this.conversationState = {
            currentAction: 'transfer',
            step: 'getItem',
            item: null,
            quantity: 0,
            newDepartment: null,
            newStorageRoom: null,
            newLocation: null,
            notes: ''
        };
        this.addMessage("Okay, let's transfer an item. What is the barcode of the item?", 'bot');
        return;
    }

    const { step } = this.conversationState;

    switch (step) {
        case 'getItem': { // Added opening brace
            const item = (await this.getInventoryCache()).find(i => i.Barcode.toLowerCase() === message.toLowerCase().trim());
            if (!item) {
                this.addMessage("I couldn't find an item with that barcode. Please try again.", 'bot');
                return;
            }
            if (item.currentStock < 1) {
                this.addMessage(`This item, <strong>${item.itemName}</strong>, is completely out of stock and cannot be transferred.`, 'bot', true);
                this.conversationState = {};
                return;
            }
            this.conversationState.item = item;
            this.conversationState.step = 'getQuantity';
            this.addMessage(`Found <strong>${item.itemName}</strong>. It's currently in the <strong>${item.currentDepartment || 'N/A'}</strong> department. There are <strong>${item.currentStock}</strong> available. How many are you transferring?`, 'bot', true);
            break;
        } // Added closing brace

        case 'getQuantity': { // Added opening brace
            const qty = parseInt(message, 10);
            const stock = this.conversationState.item.currentStock;
            if (isNaN(qty) || qty <= 0 || qty > stock) {
                this.addMessage(`Invalid quantity. Please enter a number between 1 and ${stock}.`, 'bot');
                return;
            }
            this.conversationState.quantity = qty;
            this.conversationState.step = 'getDepartment';
            const opsData = await this.getOperationsDataCache();
            const departmentOptions = opsData.dropdowns.Departments.map(d => ({ text: d, message: d }));
            this.addMessage(`Okay, transferring ${qty}. Which department should they go to?`, 'bot');
            this.renderQuickActionButtons(departmentOptions);
            break;
        } // Added closing brace

        case 'getDepartment': { // Added opening brace
            this.conversationState.newDepartment = message;
            this.conversationState.step = 'getNewStorageRoom';
            this.addMessage(`Transferring to <strong>${message}</strong>. What is the new storage room?`, 'bot', true);
            this.renderQuickActionButtons([]);
            break;
        } // Added closing brace
            
        case 'getNewStorageRoom': { // Added opening brace
            this.conversationState.newStorageRoom = message;
            this.conversationState.step = 'getNewLocation';
            this.addMessage(`Okay, the storage room is <strong>${message}</strong>. Now, what is the specific new location (e.g., Zone C - Row 1)?`, 'bot', true);
            break;
        } // Added closing brace
            
        case 'getNewLocation': { // Added opening brace
            this.conversationState.newLocation = message;
            this.conversationState.step = 'getNotes';
            this.addMessage(`Great. The new location is <strong>${message}</strong>. Are there any notes for this transfer? (Type 'none' if not)`, 'bot', true);
            break;
        } // Added closing brace
            
        case 'getNotes': { // Added opening brace
            this.conversationState.notes = message.toLowerCase() === 'none' ? '' : message;
            this.conversationState.step = 'confirm';
            this.handleTransferIntent();
            break;
        } // Added closing brace

        case 'confirm': { // Added opening brace
            const { item, quantity, newDepartment, newStorageRoom, newLocation, notes } = this.conversationState;
            const confirmHtml = `
                Please confirm the transfer:<br><ul>
                <li><strong>Item:</strong> ${item.itemName}</li>
                <li><strong>Quantity:</strong> ${quantity}</li>
                <li><strong>To Department:</strong> ${newDepartment}</li>
                <li><strong>New Room:</strong> ${newStorageRoom}</li>
                <li><strong>New Location:</strong> ${newLocation}</li>
                <li><strong>Notes:</strong> ${notes || 'N/A'}</li>
                </ul>`;
            this.addMessage(confirmHtml, 'bot', true);
            this.renderQuickActionButtons([
                { text: 'Confirm Transfer', message: 'Confirm' },
                { text: 'Cancel', message: 'Cancel' }
            ]);
            this.conversationState.step = 'execute';
            break;
        } // Added closing brace

        case 'execute': {
             if (message.toLowerCase() === 'confirm') {
                this.addMessage("Processing transfer...", 'bot');
                try {
                    const s = this.conversationState;
                    const payload = {
                        items: [{ barcode: s.item.Barcode, quantity: s.quantity, itemName: s.item.itemName }],
                        toDept: s.newDepartment,
                        newStorageRoom: s.newStorageRoom,
                        newLocation: s.newLocation,
                        notes: s.notes
                    };
                    // --- UPDATED: Use the new apiFetch helper ---
                    const response = await apiFetch('/api/processIntradepartmentTransfer', {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });
                    const result = await response.json();
                    if (!response.ok || !result.success) throw new Error(result.message);
                    this.addMessage("✅ Transfer complete!", 'bot');
                } catch (error) {
                    this.addMessage(`⚠️ Transfer failed: ${error.message}`, 'bot');
                } finally {
                    this.conversationState = {};
                    this.renderQuickActionButtons();
                }
            } else {
                this.addMessage("Transfer cancelled.", 'bot');
                this.conversationState = {};
                this.renderQuickActionButtons();
            }
            break;
        } // Added closing brace
    }
}

// In script.js, inside the UniversalChatbot class
// REPLACE your existing handleLogStatusIntent function with this one

async handleLogStatusIntent(message) {
    if (!this.conversationState.currentAction) {
        this.conversationState = {
            currentAction: 'logStatus',
            step: 'getItem',
            item: null,
            quantity: 0,
            newStatus: null,
            notes: ''
        };
        this.addMessage("Okay, we can log an item as Lost or Damaged. What is the item's barcode?", 'bot');
        return;
    }

    const { step } = this.conversationState;

    switch(step) {
        case 'getItem': {
            const item = (await this.getInventoryCache()).find(i => i.Barcode.toLowerCase() === message.toLowerCase().trim());
            if (!item) {
                this.addMessage("I couldn't find an item with that barcode. Please try again.", 'bot');
                return;
            }
            this.conversationState.item = item;
            this.conversationState.step = 'getStatus';
            this.addMessage(`Found <strong>${item.itemName}</strong>. Are you logging it as Lost or Damaged?`, 'bot', true);
            this.renderQuickActionButtons([
                { text: 'Log as Damaged', message: 'Damaged' },
                { text: 'Log as Lost', message: 'Lost' }
            ]);
            break;
        }

        case 'getStatus': {
            const status = message;
            if (status !== 'Lost' && status !== 'Damaged') {
                this.addMessage("Please select either 'Lost' or 'Damaged'.", 'bot');
                return;
            }
            this.conversationState.newStatus = status;
            this.conversationState.step = 'getQuantity';
            const { currentStock } = this.conversationState.item;
            this.addMessage(`Okay, logging as <strong>${status}</strong>. There are <strong>${currentStock}</strong> in stock. How many are you logging?`, 'bot', true);
            this.renderQuickActionButtons([]);
            break;
        }

        case 'getQuantity': {
            const qty = parseInt(message, 10);
            const { currentStock } = this.conversationState.item;
            if (isNaN(qty) || qty <= 0 || qty > currentStock) {
                this.addMessage(`Invalid quantity. Please enter a number between 1 and ${currentStock}.`, 'bot');
                return;
            }
            this.conversationState.quantity = qty;
            this.conversationState.step = 'getNotes';
            this.addMessage(`Got it: ${qty}. Please provide any notes for this report (or type 'none').`, 'bot');
            break;
        }

        case 'getNotes': {
            this.conversationState.notes = message.toLowerCase() === 'none' ? '' : message;
            this.conversationState.step = 'confirm';
            this.handleLogStatusIntent(); // Proceed to confirmation
            break;
        }
        
        case 'confirm': {
            const { item, quantity, newStatus, notes } = this.conversationState;
            const confirmHtml = `
                Please confirm:<br><ul>
                <li><strong>Item:</strong> ${item.itemName}</li>
                <li><strong>Action:</strong> Log as ${newStatus}</li>
                <li><strong>Quantity:</strong> ${quantity}</li>
                <li><strong>Notes:</strong> ${notes || 'N/A'}</li>
                </ul>`;
            this.addMessage(confirmHtml, 'bot', true);
            this.renderQuickActionButtons([
                { text: 'Confirm Log', message: 'Confirm' },
                { text: 'Cancel', message: 'Cancel' }
            ]);
            this.conversationState.step = 'execute';
            break;
        }

         case 'execute': {
            if (message.toLowerCase() === 'confirm') {
                this.addMessage("Processing log...", 'bot');
                try {
                    const s = this.conversationState;
                    const payload = {
                        items: [{ item: s.item, quantity: s.quantity }],
                        type: s.newStatus,
                        notes: s.notes,
                        user: this.user.email
                    };
                    // --- UPDATED: Use the new apiFetch helper ---
                    const response = await apiFetch('/api/logLostOrDamagedItem', {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });
                    
                    const result = await response.json();
                    if (!response.ok || !result.success) throw new Error(result.message);
                    this.addMessage(`✅ Successfully logged ${s.quantity} of ${s.item.itemName} as ${s.newStatus}.`, 'bot');
                } catch (error) {
                    this.addMessage(`⚠️ Log failed: ${error.message}`, 'bot');
                } finally {
                    this.conversationState = {};
                    this.renderQuickActionButtons();
                }
            } else {
                this.addMessage("Log cancelled.", 'bot');
                this.conversationState = {};
                this.renderQuickActionButtons();
            }
            break;
        }
    }
}

    // --- INTENT HANDLERS ---
  async handleSearchIntent(query) {
    if (!query) {
        this.addMessage("Sure, what would you like to search for?", 'bot');
        return;
    }

    const inventory = await this.getInventoryCache();
    
    // --- FIX IS HERE ---
    // Convert the query to lowercase for a case-insensitive search
    const queryLower = query.toLowerCase();
    
    const results = inventory.filter(item =>
        (item.itemName || '').toLowerCase().includes(queryLower) ||
        (item.Barcode || '').toLowerCase().includes(queryLower)
    );
    // --- END OF FIX ---

    this.renderSearchResults(results, query);
}

    async handleStatsIntent(query) {
        const data = await this.getDashboardDataCache();
        if (!data || !data.summary) {
            this.addMessage("I couldn't retrieve the dashboard stats at the moment. Please try again later.", 'bot');
            return;
        }
        const { summary } = data;
        let response = "I'm not sure which stat you're asking about. I can tell you about 'items out', 'items needing attention', or 'total item types'.";
        if (query.includes('out')) {
            response = `There are currently <strong>${summary.itemsOut}</strong> items checked out or assigned.`;
        } else if (query.includes('attention')) {
            response = `There are <strong>${summary.itemsAttention}</strong> items that need attention (e.g., lost or damaged).`;
        } else if (query.includes('total')) {
            response = `There are <strong>${summary.totalItemTypes}</strong> total item types in the inventory.`;
        }
        this.addMessage(response, 'bot', true);
    }

    // --- RESPONSE RENDERING ---
    renderSearchResults(results, query) {
        if (results.length === 0) {
            this.addMessage(`I couldn't find any items matching "<em>${query}</em>". Please try a different search term.`, 'bot', true);
            return;
        }
        if (results.length === 1) {
            const item = results[0];
            let detailsHtml = `
                Found it! Here are the details for <strong>${item.itemName}</strong>:<br>
                <ul>
                    <li><strong>Barcode:</strong> ${item.Barcode}</li>
                    <li><strong>Stock:</strong> ${item.currentStock} / ${item.totalStock}</li>
                    <li><strong>Status:</strong> ${item.loanStatus}</li>
                    <li><strong>Location:</strong> ${item.location || item.storageRoom || 'N/A'}</li>
                </ul>
            `;
            this.addMessage(detailsHtml, 'bot', true);
        } else {
            let resultsHtml = `I found ${results.length} items matching "<em>${query}</em>":<br><ul>`;
            results.slice(0, 5).forEach(item => {
                resultsHtml += `<li><strong>${item.itemName}</strong> (${item.Barcode})</li>`;
            });
            resultsHtml += '</ul>';
            if (results.length > 5) {
                resultsHtml += '...and more. Try a more specific search.';
            }
            this.addMessage(resultsHtml, 'bot', true);
        }
    }

    showTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.style.display = 'block';
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.style.display = 'none';
    }
}

/**
 * Updates the user's display name in the top navigation bar.
 * @param {string} newName The user's full new display name.
 */
function updateTopBarUserName(newName) {
    const userNameElement = document.querySelector('#top-bar-user-container .user-name');
    if (userNameElement) {
        // Display only the first name for brevity
        const firstName = newName || 'User';
        userNameElement.textContent = firstName;
    }
}
