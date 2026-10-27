document.addEventListener("DOMContentLoaded", function () {
    console.log("Dark Gaming Universe About Page Loaded!");

    // Hover effect on team members
    document.querySelectorAll(".team-member").forEach(member => {
        member.addEventListener("mouseover", () => {
            member.style.boxShadow = "0px 0px 20px #ffcc00";
        });

        member.addEventListener("mouseout", () => {
            member.style.boxShadow = "none";
        });
    });

    // Hover effect on feature items
    document.querySelectorAll(".feature-item").forEach(item => {
        item.addEventListener("mouseover", () => {
            item.style.backgroundColor = "#333";
        });

        item.addEventListener("mouseout", () => {
            item.style.backgroundColor = "#222";
        });
    });
});
