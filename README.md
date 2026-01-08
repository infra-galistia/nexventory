# NexVentory - Inventory Management System

**NexVentory** is a cloud-based inventory tracking application designed to streamline equipment loans, stock management, and user accountability. Built with **Firebase** and vanilla JavaScript, it offers a fast, reactive interface for managing real-time inventory operations.

## 🚀 Key Features

* **Real-time Dashboard:** Visual "Zone Explorer" to see stock levels across different rooms and storage zones.
* **Operations Console:** * **Checkout/Check-in:** Rapidly assign items to students or staff.
    * **Kits & Bundles:** Manage complex project kits with multiple components.
    * **Incident Reporting:** Log lost or damaged items directly from the workflow.
* **User Management:** Integration with Firebase Auth for secure Google Sign-In and role-based access (Admin vs. Standard User).
* **Dark Mode:** Fully supported dark/light theme toggle for better usability in different lighting conditions.
* **Multi-Tenancy Architecture:** Built to support multiple organizations with data isolation (Organization IDs).

## 🛠️ Tech Stack

* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+).
* **Backend:** Firebase Cloud Functions (Node.js).
* **Database:** Cloud Firestore (NoSQL).
* **Auth:** Firebase Authentication.
* **Hosting:** Firebase Hosting.

## 📦 Installation & Setup

To run this project locally, you need the **Firebase CLI**.

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/YOUR_USERNAME/nexventory.git](https://github.com/YOUR_USERNAME/nexventory.git)
    cd nexventory
    ```

2.  **Install Dependencies (for Functions):**
    ```bash
    cd functions
    npm install
    cd ..
    ```

3.  **Login to Firebase:**
    ```bash
    firebase login
    ```

4.  **Run Local Emulators (Recommended):**
    This allows you to test Functions and Firestore without affecting production data.
    ```bash
    firebase emulators:start
    ```

5.  **Deploy to Live:**
    ```bash
    firebase deploy
    ```

## 📂 Project Structure

* `public/` - Static files (HTML, CSS, Client-side JS).
    * `dashboard.js` - Logic for the main landing page and data visualization.
    * `operations.js` - Core logic for inventory transactions.
    * `style.css` - Global styles and Dark Mode definitions.
* `functions/` - Backend logic (API endpoints, Auth triggers).
* `firestore.rules` - Security rules for database access.

## 🛡️ License

Private Project. All rights reserved.