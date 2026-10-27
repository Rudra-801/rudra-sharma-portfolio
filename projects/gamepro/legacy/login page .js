document.addEventListener("DOMContentLoaded", function () {
    // Password toggle functionality
    const passwordInput = document.getElementById("password");
    const togglePassword = document.getElementById("togglePassword");

    togglePassword.addEventListener("click", function () {
        if (passwordInput.type === "password") {
            passwordInput.type = "text";
        } else {
            passwordInput.type = "password";
        }
    });

    // Form validation
    const form = document.querySelector("form");

    form.addEventListener("submit", function (event) {
        event.preventDefault(); // Prevent actual form submission

        const firstName = document.querySelector("input[placeholder='First Name']").value.trim();
        const lastName = document.querySelector("input[placeholder='Last Name']").value.trim();
        const email = document.querySelector("input[type='email']").value.trim();
        const password = passwordInput.value.trim();
        const termsCheckbox = document.querySelector("input[type='checkbox']").checked;

        // Simple email validation
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!firstName || !lastName || !email || !password) {
            alert("Please fill in all fields.");
            return;
        }

        if (!emailPattern.test(email)) {
            alert("Please enter a valid email address.");
            return;
        }

        if (!termsCheckbox) {
            alert("You must agree to the Terms & Conditions.");
            return;
        }

        alert("Account created successfully! 🎉");
        form.reset(); // Clear the form after submission
    });
});

document.addEventListener("DOMContentLoaded", function () {
    const form = document.querySelector("form");

    form.addEventListener("submit", function (event) {
        event.preventDefault(); // Prevent form from actually submitting

        // Get user input values
        const email = document.querySelector("input[type='email']").value.trim();
        const password = document.querySelector("input[type='password']").value.trim();

        // Simple validation (Ensure fields are filled)
        if (!email || !password) {
            alert("Please enter both email and password.");
            return;
        }

        // Simulate successful login (Replace this with actual authentication)
        alert("Login Successful! Redirecting...");

        // Redirect user to the dashboard or another page after login
        window.location.href = "dashboard.html"; // Change to your actual page
    });
});
