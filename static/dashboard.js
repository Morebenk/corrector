// Shared state
window.Dashboard = window.Dashboard || {};
Dashboard.questionsData = [];
Dashboard.uniqueCategories = [];
Dashboard.categoryColors = [
  "#4c6fff",
  "#6f42c1",
  "#20c997",
  "#8c510a",
  "#e83e8c",
  "#6c757d",
  "#17a2b8",
  "#6610f2",
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

// Call this from DOMContentLoaded in HTML
setupEventListeners();
