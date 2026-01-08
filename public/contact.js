// /public/contact.js

document.addEventListener('DOMContentLoaded', () => {
    // This is a placeholder for onAuthReady, as this page doesn't need dynamic data loading.
    // We just need to hide the main preloader.
    hideAppPreloader();

    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactSubmit);
    }
});

async function handleContactSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('submitContactBtn');
    showSpinner(submitBtn);

    const payload = {
        category: `Contact Form: ${document.getElementById('inquiryType').value}`,
        comment: `Name: ${document.getElementById('contactName').value}\nMessage: ${document.getElementById('contactMessage').value}`,
        userEmail: document.getElementById('contactEmail').value,
        pageUrl: window.location.href
    };

    try {
        // We reuse the same feedback endpoint for simplicity
        const response = await fetch('/api/submitFeedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'An unknown error occurred.');

        displayMessage('Thank you! Your message has been sent successfully.', 'success', 'contact-message-box');
        e.target.reset(); // Clear the form

    } catch (error) {
        displayMessage(`Submission failed: ${error.message}`, 'error', 'contact-message-box');
    } finally {
        hideSpinner(submitBtn);
    }
}
