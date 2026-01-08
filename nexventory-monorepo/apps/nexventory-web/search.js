// Page-specific script for search.html

let allItemsCache = [];

function onAuthReady(user) {
    const searchPageContent = document.getElementById('search-page-content');
    if (!searchPageContent) return;

    if (user) {
        fetchSearchPageData();
    } else {
        document.getElementById('search-preloader').style.display = 'none';
        searchPageContent.innerHTML = `<div class="content-block" style="text-align:center;"><h2>Please Sign In</h2><p>You must be signed in to search the inventory.</p></div>`;
        searchPageContent.style.display = 'block';
        hideAppPreloader();
    }
}



async function fetchSearchPageData() {
    const searchPreloader = document.getElementById('search-preloader');
    const searchPageContent = document.getElementById('search-page-content');

    try {
        searchPreloader.style.display = 'flex';
        
        // UPDATED: Use the new apiFetch helper
        const response = await apiFetch('/api/getSearchPageData', {
            method: 'POST',
            body: JSON.stringify({})
        });

        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
        
        window.pageDataCache = await response.json();
        allItemsCache = window.pageDataCache.allItems || [];

        searchPreloader.style.display = 'none';
        searchPageContent.style.display = 'block';
        
        hideAppPreloader();
        setupSearchPageListeners();

        const urlParams = new URLSearchParams(window.location.search);
        const barcodeToSearch = urlParams.get('barcode');

        if (barcodeToSearch) {
            const itemToDisplay = allItemsCache.find(item => 
                (item.Barcode || '').toLowerCase() === barcodeToSearch.toLowerCase()
            );

            if (itemToDisplay) {
                displayItemDetails(itemToDisplay);
            } else {
                alert(`Item with barcode "${barcodeToSearch}" from the link was not found.`);
            }
        }
    } catch (error) {
        console.error("Could not fetch search data:", error);
        searchPreloader.style.display = 'none';
        searchPageContent.innerHTML = `<div class="message-box error" style="display:block;">Failed to load search data.</div>`;
        searchPageContent.style.display = 'block';
        hideAppPreloader();
    }
}



function setupSearchPageListeners() {
    const searchInput = document.getElementById('mainSearchInput');

    // Sets up the autocomplete dropdown as you type
    setupItemSelector('main', displayItemDetails, () => allItemsCache);
    
    // Attaches the camera scanner to the "Scan" button
    document.getElementById('scanBtn')?.addEventListener('click', () => handleScanClick(displayItemDetails));
    
    // Attaches the full item list to the "List All" button
    document.getElementById('listAllBtn')?.addEventListener('click', () => handleListAllClick(allItemsCache, displayItemDetails));
    
    // --- THIS IS THE NEW PART ---
    // Adds an event listener for physical barcode scanners.
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            // Checks if the key pressed was 'Enter'
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevents any default form submission
                const barcode = searchInput.value.trim();

                if (barcode) {
                    const foundItem = allItemsCache.find(item => 
                        (item.Barcode || '').toLowerCase() === barcode.toLowerCase()
                    );
                    
                    if (foundItem) {
                        // If an item is found, display its details
                        displayItemDetails(foundItem);
                    } else {
                        // If not found, show an alert
                        alert(`Item with barcode "${barcode}" not found.`);
                    }
                    
                    // Clear the input field for the next scan
                    searchInput.value = '';
                }
            }
        });
    }
}

function displayItemDetails(item) {
    const detailsContainer = document.getElementById('itemDetailsContainer');
    if (!detailsContainer) return;

    if (item) {
        detailsContainer.classList.remove('hidden');
        renderSelectedItemDetails(item, 'itemDetailsContainer');
    } else {
        detailsContainer.classList.add('hidden');
    }
}
