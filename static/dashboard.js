// Shared state
window.Dashboard = window.Dashboard || {};
Dashboard.questionsData = [];
Dashboard.uniqueCategories = [];
Dashboard.categoryColors = [
  "#4c6fff", // Blue
  "#2ecc71", // Green
  "#e74c3c", // Red
  "#f39c12", // Orange
  "#9b59b6", // Purple
  "#1abc9c", // Turquoise
  "#34495e", // Dark Blue
  "#e67e22", // Pumpkin
  "#3498db", // Light Blue
  "#16a085", // Sea Green
];
Dashboard.categoryColorMap = {};
Dashboard.availableFilePaths = [];

// Event listeners
function setupEventListeners() {
  const statusDropdown = document.getElementById("statusDropdown");
  const categoryDropdown = document.getElementById("categoryDropdown");
  const searchInput = document.getElementById("searchInput");
  const requiresImageDropdown = document.getElementById(
    "requiresImageDropdown"
  );
  const questionDropdown = document.getElementById("questionDropdown");
  const filePathDropdown = document.getElementById("filePathDropdown");

  if (statusDropdown)
    statusDropdown.addEventListener("change", () => {
      Dashboard.populateQuestions();
      Dashboard.saveFilters();
    });
  if (categoryDropdown)
    categoryDropdown.addEventListener("change", () => {
      Dashboard.populateQuestions();
      Dashboard.saveFilters();
    });
  if (searchInput)
    searchInput.addEventListener("input", () => {
      Dashboard.populateQuestions();
      Dashboard.saveFilters();
    });
  if (requiresImageDropdown)
    requiresImageDropdown.addEventListener("change", () => {
      Dashboard.populateQuestions();
      Dashboard.saveFilters();
    });
  if (questionDropdown)
    questionDropdown.addEventListener("change", (e) =>
      Dashboard.displayQuestionDetails(e.target.value, true)
    );
  if (filePathDropdown)
    filePathDropdown.addEventListener("change", () => {
      Dashboard.fetchQuestions().then(() => Dashboard.loadFilters());
      Dashboard.saveFilters();
    });
}

Dashboard.toggleCorrectionMode = function () {
  const body = document.body;
  const button = document.getElementById("correctionModeToggle");
  const isEnabled = body.getAttribute("data-correction-mode") === "true";

  body.setAttribute("data-correction-mode", !isEnabled);
  button.classList.toggle("active");

  // Save preference to localStorage
  localStorage.setItem("correction-mode", !isEnabled);
};

// Initialize correction mode state and setup event listeners
document.addEventListener("DOMContentLoaded", function () {
  const savedMode = localStorage.getItem("correction-mode") === "true";
  const button = document.getElementById("correctionModeToggle");

  if (savedMode) {
    document.body.setAttribute("data-correction-mode", "true");
    button.classList.add("active");
  }

  button.addEventListener("click", Dashboard.toggleCorrectionMode);

  // Set up all event listeners
  setupEventListeners();
});
