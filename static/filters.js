Dashboard.saveFilters = function () {
  const filters = {
    status: document.getElementById("statusDropdown").value,
    category: document.getElementById("categoryDropdown").value,
    search: document.getElementById("searchInput").value,
    requiresImage: document.getElementById("requiresImageDropdown").value,
    filePath: document.getElementById("filePathDropdown").value,
  };
  localStorage.setItem("dashboardFilters", JSON.stringify(filters));
};

Dashboard.loadFilters = function () {
  const savedFilters = localStorage.getItem("dashboardFilters");
  if (savedFilters) {
    const filters = JSON.parse(savedFilters);
    const statusDropdown = document.getElementById("statusDropdown");
    const categoryDropdown = document.getElementById("categoryDropdown");
    const filePathDropdown = document.getElementById("filePathDropdown");
    if (
      filters.status &&
      statusDropdown.querySelector(`option[value="${filters.status}"]`)
    )
      statusDropdown.value = filters.status;
    if (
      filters.category &&
      categoryDropdown.querySelector(`option[value="${filters.category}"]`)
    )
      categoryDropdown.value = filters.category;
    if (filters.search)
      document.getElementById("searchInput").value = filters.search;
    if (filters.requiresImage)
      document.getElementById("requiresImageDropdown").value =
        filters.requiresImage;
    if (
      filters.filePath &&
      filePathDropdown.querySelector(`option[value="${filters.filePath}"]`)
    )
      filePathDropdown.value = filters.filePath;
    Dashboard.populateQuestions();
  }
};

Dashboard.setupFilterListeners = function () {
  // Add change event listeners to all filter inputs
  const filterIds = [
    "statusDropdown",
    "categoryDropdown",
    "searchInput",
    "requiresImageDropdown",
    "filePathDropdown",
  ];

  filterIds.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      if (id === "searchInput") {
        // For search, use input event to catch changes as user types
        element.addEventListener("input", () => {
          Dashboard.saveFilters();
          Dashboard.populateQuestions(true);
        });
      } else {
        element.addEventListener("change", () => {
          Dashboard.saveFilters();
          Dashboard.populateQuestions(true);
        });
      }
    }
  });
};

// Initialize filter listeners when document is ready
document.addEventListener("DOMContentLoaded", () => {
  Dashboard.setupFilterListeners();
});

Dashboard.populateFilters = function (preserveFilters = true) {
  // Get saved filters if we want to preserve them
  const savedFilters = preserveFilters
    ? JSON.parse(localStorage.getItem("dashboardFilters") || "{}")
    : {};

  // Populate status dropdown
  const statusDropdown = document.getElementById("statusDropdown");
  statusDropdown.innerHTML = '<option value="all">All Statuses</option>';
  Array.from(new Set(Dashboard.questionsData.map((q) => q.status)))
    .sort()
    .forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      statusDropdown.appendChild(option);
    });

  // Populate category dropdown
  const categoryDropdown = document.getElementById("categoryDropdown");
  categoryDropdown.innerHTML = '<option value="all">All Categories</option>';
  Array.from(Dashboard.uniqueCategories)
    .sort()
    .forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categoryDropdown.appendChild(option);
    });

  // Populate file path dropdown
  const filePathDropdown = document.getElementById("filePathDropdown");
  filePathDropdown.innerHTML = '<option value="all">All Files</option>';
  Dashboard.availableFilePaths.sort().forEach((filePath) => {
    const option = document.createElement("option");
    option.value = filePath;
    const fileName = filePath.split("/").pop();
    option.textContent = fileName;
    option.title = filePath;
    filePathDropdown.appendChild(option);
  });

  if (preserveFilters) {
    // Restore all filter values
    if (savedFilters.status) statusDropdown.value = savedFilters.status;
    if (savedFilters.category) categoryDropdown.value = savedFilters.category;
    if (savedFilters.filePath) filePathDropdown.value = savedFilters.filePath;
    if (savedFilters.search)
      document.getElementById("searchInput").value = savedFilters.search;
    if (savedFilters.requiresImage) {
      document.getElementById("requiresImageDropdown").value =
        savedFilters.requiresImage;
    }
  }
};
