// Page-specific script for index.html (Dashboard)

let zoneDataCache = null;
let explorerState = [];

function onAuthReady(user) {
    const dashboardContent = document.getElementById('dashboard-content');
    if (!dashboardContent) return;

    if (user) {
        fetchDashboardData();
    } else {
        dashboardContent.innerHTML = `<div class="content-block" style="text-align:center;"><h2>Welcome to NexVentory</h2><p>Please sign in to continue.</p></div>`;
        dashboardContent.style.display = 'block';
        hideAppPreloader(); 
    }
}

async function fetchDashboardData() {
    const container = document.getElementById('dashboard-content');
    try {
        container.style.display = 'block';
        container.innerHTML = '<div class="loading-placeholder"><span class="spinner"></span> Loading Dashboard...</div>';

        // --- THIS IS THE FIX ---
        // Changed the old fetch() to the new apiFetch() helper.
        // This ensures the organizationId is automatically included in the request.
        const response = await apiFetch('/api/getDashboardData', {
            method: 'POST',
            body: JSON.stringify({}) // Body is required, even if empty, to send organizationId
        });
        // --- END OF FIX ---

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${errorText}`);
        }
        const data = await response.json();
        zoneDataCache = data.zoneData || {};
        renderDashboard(data);
    } catch (error) {
        console.error("Could not fetch dashboard data:", error);
        container.innerHTML = `<div class="message-box error" style="display:block;">Failed to load dashboard data.</div>`;
    } finally {
        hideAppPreloader();
    }
}

function renderDashboard(data) {
    const container = document.getElementById('dashboard-content');
    container.innerHTML = `
        <h1>Inventory Dashboard</h1>
        <section class="quick-actions-bar">
            <a href="/operations.html?view=Checkout" class="btn btn-success"><i class="fas fa-arrow-up"></i> Check Out</a>
            <a href="/operations.html?view=CheckIn" class="btn"><i class="fas fa-arrow-down"></i> Check In</a>
            <a href="/search.html" class="btn btn-accent"><i class="fas fa-search"></i> Search</a>
        </section>
        <div id="summary-grid" class="dashboard-grid"></div>
        <div id="summary-pagination" class="pagination-dots"></div>
        <div id="user-info-grid" class="dashboard-grid"></div>
        <div id="user-info-pagination" class="pagination-dots"></div>
        <div id="zone-explorer-section"></div>
        <div id="activity-container"></div>
    `;
    renderSummaryCards(data.summary || {});
    renderUserAndPopularItems(data.userItems || [], data.popularItems || []);
    renderZoneExplorer();
    renderActivityFeed(data.activity || []);
    setupCarousel('summary-grid', 'summary-pagination');
    setupCarousel('user-info-grid', 'user-info-pagination');
}


function renderSummaryCards(summary) {
    const container = document.getElementById('summary-grid');
    if (!container) return;
    container.innerHTML = `
        <div class="summary-card"><i class="fas fa-boxes"></i><h3>Total Item Types</h3><p class="summary-count">${summary.totalItemTypes || 0}</p></div>
        <div class="summary-card"><i class="fas fa-sign-out-alt"></i><h3>Items Out / Assigned</h3><p class="summary-count">${summary.itemsOut || 0}</p></div>
        <div class="summary-card attention"><i class="fas fa-exclamation-triangle"></i><h3>Items Needing Attention</h3><p class="summary-count">${summary.itemsAttention || 0}</p></div>
    `;
}

function renderUserAndPopularItems(userItems, popularItems) {
    const container = document.getElementById('user-info-grid');
    if (!container) return;
    
    let userItemsHTML = '<h2>My Checked-Out Items</h2>' + (userItems.length === 0 ? '<p>You have no items checked out.</p>' : '<ul class="dashboard-list">' + userItems.map(item => `<li><span class="item-name">${item.name}</span></li>`).join('') + '</ul>');
    
    let popularItemsHTML = '<h2>Most Active Items</h2>';
    if (!popularItems || popularItems.length === 0) {
        popularItemsHTML += '<p>No checkout activity recorded yet.</p>';
    } else {
        popularItemsHTML += '<ul class="dashboard-list">';
        popularItemsHTML += popularItems.map(item => {
            const itemName = item.name || '[Item Not Found]'; 
            const itemCount = item.count || 0;
            return `<li>
                        <span class="item-name">${itemName}</span>
                        <span class="item-count">${itemCount} checkout${itemCount !== 1 ? 's' : ''}</span>
                    </li>`;
        }).join('');
        popularItemsHTML += '</ul>';
    }
    
    container.innerHTML = `<div class="dashboard-section">${userItemsHTML}</div><div class="dashboard-section">${popularItemsHTML}</div>`;
}

function renderActivityFeed(activityLogs) {
    const container = document.getElementById('activity-container');
    if (!container) return;
    
    let content = `<div class="dashboard-section"><h2>Recent Activity</h2>`;
    if (!activityLogs || activityLogs.length === 0) {
        content += '<p>No recent activity found.</p>';
    } else {
        // --- FIX for Activity Filter ---
        // This structure ensures the CSS can correctly show/hide the controls.
        content += `
            <div class="activity-filter-bar">
                <div class="activity-filter-buttons">
                    <button class="btn active" data-filter="all">All</button>
                    <button class="btn" data-filter="checkout">Check-Outs</button>
                    <button class="btn" data-filter="checkin">Check-Ins</button>
                    <button class="btn" data-filter="attention">Attention</button>
                    <button class="btn" data-filter="admin">Admin</button>
                </div>
                <select class="form-control activity-filter-dropdown">
                    <option value="all">All Activity</option>
                    <option value="checkout">Check-Outs</option>
                    <option value="checkin">Check-Ins</option>
                    <option value="attention">Attention</option>
                    <option value="admin">Admin</option>
                </select>
            </div>
        `;

        const groupedByDate = activityLogs.reduce((acc, log) => {
            const date = new Date(log.timestamp._seconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            if (!acc[date]) acc[date] = [];
            acc[date].push(log);
            return acc;
        }, {});

        content += '<div id="activity-feed-content">';
        Object.keys(groupedByDate).sort((a,b) => new Date(b) - new Date(a)).forEach((dateStr, index) => {
            content += `<details class="activity-group" ${index === 0 ? 'open' : ''}>
                <summary class="activity-date-header"><span>${dateStr}</span><i class="fas fa-chevron-down"></i></summary>
                <ul class="activity-feed">`;
            
            groupedByDate[dateStr].forEach(log => {
                const activityInfo = getActivityIcon(log.type);
                content += `
                    <li class="feed-item" data-type="${activityInfo.filterType}">
                        <i class="feed-icon fas ${activityInfo.icon} ${activityInfo.colorClass}"></i>
                        <div class="feed-content">
                            <p>${getTransactionText(log)}</p>
                            <p class="timestamp">${new Date(log.timestamp._seconds * 1000).toLocaleString()}</p>
                        </div>
                    </li>`;
            });
            content += `</ul></details>`;
        });
        content += `</div>`;
    }
    content += `</div>`;
    container.innerHTML = content;
    setupActivityFilterListeners();
}

function getActivityIcon(type) {
    const typeLower = type ? type.toLowerCase() : '';
    if (typeLower.includes('out')) return { icon: 'fa-arrow-up', colorClass: 'checkout', filterType: 'checkout' };
    if (typeLower.includes('in')) return { icon: 'fa-arrow-down', colorClass: 'checkin', filterType: 'checkin' };
    if (typeLower.includes('transfer')) return { icon: 'fa-exchange-alt', colorClass: 'admin', filterType: 'admin' };
    if (typeLower.includes('lost') || typeLower.includes('damaged')) return { icon: 'fa-exclamation-triangle', colorClass: 'attention', filterType: 'attention' };
    if (typeLower.includes('new') || typeLower.includes('update')) return { icon: 'fa-plus-circle', colorClass: 'admin', filterType: 'admin' };
    return { icon: 'fa-info-circle', colorClass: 'admin', filterType: 'admin' };
}

// In public/dashboard.js

function getTransactionText(log) {
    const user = `<span class="user">${log.user || 'System'}</span>`;
    const context = log.context || {};
    const items = log.items || [];
    const qty = items.reduce((sum, i) => sum + (i.quantity || 0), 0) || context.numKits || log.quantity || 1;
    const assignedTo = context.assignedTo || log.userName || '[N/A]';

    let itemLinks;
    if (items && items.length > 0) {
        // This part now handles multiple items in a single transaction,
        // creating a link for each one.
        itemLinks = items.map(i => {
            const item = i.item || {};
            const barcode = item.Barcode || item.barcode || 'N/A';
            const itemName = item.itemName || barcode; // Fallback to barcode if no name
            return `<a href="/search.html?barcode=${barcode}"><strong>${itemName}</strong></a>`;
        }).join(', ');
    } else {
        // This is a fallback for older transaction types or those without a nested item object.
        const itemName = context.projectName || log.itemName || (log.barcode) || '[Item]';
        const barcode = log.barcode || '';
        itemLinks = `<a href="/search.html?barcode=${barcode}"><strong>${itemName}</strong></a>`;
    }

    // The switch statement now uses the generated `itemLinks`
    switch (log.type) {
        case 'Check-Out':
        case 'Bulk Component-Out':
            return `${user} checked out ${qty > 1 ? qty + ' of' : ''} ${itemLinks} to ${assignedTo}.`;
        case 'Bulk Checkout - Kit':
            return `${user} checked out ${qty} kit(s) of ${itemLinks} to ${assignedTo}.`;
        case 'Check-In':
        case 'Project Check-In':
            return `${user} checked in ${qty > 1 ? qty + ' of' : ''} ${itemLinks}.`;
        case 'New Item Added':
            return `${user} added the new item: ${itemLinks}.`;
        case 'Item Details Updated':
            return `${user} updated details for ${itemLinks}.`;
        case 'Lost':
        case 'Damaged':
            return `${user} logged ${qty} of ${itemLinks} as <strong>${log.type}</strong>.`;
        case 'Intradepartment Transfer':
             return `${user} transferred ${qty} of ${itemLinks}.`;
        default:
            return `${user} performed action: <strong>${log.type || 'Unknown'}</strong> on ${itemLinks}.`;
    }
}

function setupActivityFilterListeners() {
    const filterBar = document.querySelector('.activity-filter-bar');
    if (!filterBar) return;

    const applyFilter = (filterValue) => {
        const feedContent = document.getElementById('activity-feed-content');
        if (!feedContent) return;

        feedContent.querySelectorAll('.feed-item').forEach(item => {
            item.style.display = (filterValue === 'all' || item.dataset.type === filterValue) ? 'flex' : 'none';
        });

        feedContent.querySelectorAll('.activity-group').forEach(group => {
            const visibleItems = group.querySelectorAll('.feed-item[style*="display: flex"]');
            group.style.display = visibleItems.length > 0 ? 'block' : 'none';
        });
    };

    filterBar.querySelector('.activity-filter-buttons')?.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            filterBar.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            applyFilter(e.target.dataset.filter);
        }
    });

    filterBar.querySelector('.activity-filter-dropdown')?.addEventListener('change', (e) => {
        applyFilter(e.target.value);
    });
}

function renderZoneExplorer() {
    explorerState = [];
    renderRoomCards();
}

function handleExplorerBack() {
    explorerState.pop(); // Remove current level
    const lastState = explorerState.pop(); // Get previous level
    
    if (!lastState) {
        renderRoomCards();
    } else if (lastState.level === 'zones') {
        renderZoneCards(lastState.room);
    } else if (lastState.level === 'rows') {
        renderRowCards(lastState.room, lastState.zone);
    } else {
        renderRoomCards();
    }
}

function renderRoomCards() {
    explorerState = []; // Reset state when at the top level
    const container = document.getElementById('zone-explorer-section');
    const rooms = Object.keys(zoneDataCache);
    let content = `
        <div class="dashboard-section">
            <h2>Zone Explorer</h2>
            <div id="explorer-grid" class="dashboard-grid">
    `;
    if (rooms.length === 0) {
        content += '<div class="summary-card" style="text-align: center; padding: 20px;"><p>No storage rooms defined.</p></div>';
    } else {
        const colors = ['#0077B6', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51', '#00B4D8'];
        content += rooms.map((roomName, index) => `
            <div class="explorer-card" onclick="renderZoneCards('${roomName.replace(/'/g, "\\'")}')">
                <i class="fas fa-warehouse" style="color: ${colors[index % colors.length]};"></i>
                <h4>${roomName}</h4>
            </div>`).join('');
    }
    content += `</div><div id="explorer-pagination" class="pagination-dots"></div></div>`;
    container.innerHTML = content;
    setupCarousel('explorer-grid', 'explorer-pagination');
}

function renderZoneCards(roomName) {
    explorerState.push({ level: 'rooms', room: roomName });
    const container = document.getElementById('zone-explorer-section');
    const zones = Object.keys(zoneDataCache[roomName] || {});
    
    let content = `
        <div class="dashboard-section">
            <div class="explorer-header">
                <button class="btn" onclick="handleExplorerBack()"><i class="fas fa-arrow-left"></i> Back</button>
                <h2>Zones in ${roomName}</h2>
            </div>
            <div id="explorer-grid" class="dashboard-grid">
    `;
    if (zones.length === 0) {
        content += '<div class="summary-card"><p>No zones found.</p></div>';
    } else {
        const colors = ['#0077B6', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51', '#00B4D8'];
        content += zones.map((zoneName, index) => `
            <div class="explorer-card" onclick="renderRowCards('${roomName.replace(/'/g, "\\'")}', '${zoneName.replace(/'/g, "\\'")}')">
                <i class="fas fa-th-large" style="color: ${colors[index % colors.length]};"></i>
                <h4>${zoneName}</h4>
            </div>`).join('');
    }
    content += `</div><div id="explorer-pagination" class="pagination-dots"></div></div>`;
    container.innerHTML = content;
    setupCarousel('explorer-grid', 'explorer-pagination');
}

function renderRowCards(roomName, zoneName) {
    explorerState.push({ level: 'zones', room: roomName, zone: zoneName });
    const container = document.getElementById('zone-explorer-section');
    const rows = Object.keys(zoneDataCache[roomName]?.[zoneName] || {});

    let content = `
        <div class="dashboard-section">
            <div class="explorer-header">
                <button class="btn" onclick="handleExplorerBack()"><i class="fas fa-arrow-left"></i> Back</button>
                <h2>Rows in ${zoneName}</h2>
            </div>
            <div id="explorer-grid" class="dashboard-grid">
    `;
    if (rows.length === 0) {
        content += '<div class="summary-card"><p>No rows found.</p></div>';
    } else {
        const colors = ['#0077B6', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51', '#00B4D8'];
        content += rows.map((rowName, index) => `
            <div class="explorer-card" onclick="renderItemList('${roomName.replace(/'/g, "\\'")}', '${zoneName.replace(/'/g, "\\'")}', '${rowName.replace(/'/g, "\\'")}')">
                <i class="fas fa-grip-horizontal" style="color: ${colors[index % colors.length]};"></i>
                <h4>${rowName}</h4>
            </div>`).join('');
    }
    content += `</div><div id="explorer-pagination" class="pagination-dots"></div></div>`;
    container.innerHTML = content;
    setupCarousel('explorer-grid', 'explorer-pagination');
}

function renderItemList(roomName, zoneName, rowName) {
    explorerState.push({ level: 'rows', room: roomName, zone: zoneName, row: rowName });
    const container = document.getElementById('zone-explorer-section');
    const items = zoneDataCache[roomName]?.[zoneName]?.[rowName]?.items || [];

    let content = `
        <div class="dashboard-section">
            <div class="explorer-header">
                <button class="btn" onclick="handleExplorerBack()"><i class="fas fa-arrow-left"></i> Back</button>
                <h2>Items in ${rowName}</h2>
            </div>
    `;
    if (items.length === 0) {
        content += '<p style="text-align: center; padding: 20px;">No items found in this location.</p>';
    } else {
        content += '<div class="explorer-item-list-container">';
        content += '<ul class="explorer-item-list">';
        content += items.map(item => {
            const statusClass = item.status === 'present' ? 'text-success' : 'text-danger';
            const statusIcon = item.status === 'present' ? 'fa-check-circle' : 'fa-times-circle';
            return `<li><span class="item-name">${item.name}</span> <span class="item-status ${statusClass}"><i class="fas ${statusIcon}"></i> ${item.status}</span></li>`;
        }).join('');
        content += '</ul></div>';
    }
    content += `</div>`;
    container.innerHTML = content;
}
