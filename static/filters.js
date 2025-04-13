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
    if (filters.status)
      document.getElementById("statusDropdown").value = filters.status;
    if (filters.category)
      document.getElementById("categoryDropdown").value = filters.category;
    if (filters.search)
      document.getElementById("searchInput").value = filters.search;
    if (filters.requiresImage)
      document.getElementById("requiresImageDropdown").value =
        filters.requiresImage;
    if (filters.filePath)
      document.getElementById("filePathDropdown").value = filters.filePath;
    Dashboard.populateQuestions();
  }
};

Dashboard.populateFilters = function () {
  const statusSet = new Set(Dashboard.questionsData.map((q) => q.status));
  const statusDropdown = document.getElementById("statusDropdown");
  while (statusDropdown.options.length > 1) statusDropdown.remove(1);
  Array.from(statusSet)
    .sort()
    .forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      statusDropdown.appendChild(option);
    });

  const categoryDropdown = document.getElementById("categoryDropdown");
  while (categoryDropdown.options.length > 1) categoryDropdown.remove(1);
  Array.from(Dashboard.uniqueCategories)
    .sort()
    .forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categoryDropdown.appendChild(option);
    });

  const filePathDropdown = document.getElementById("filePathDropdown");
  const currentSelection = filePathDropdown.value;
  while (filePathDropdown.options.length > 1) filePathDropdown.remove(1);
  Dashboard.availableFilePaths.sort().forEach((filePath) => {
    const option = document.createElement("option");
    option.value = filePath;
    const fileName = filePath.split("/").pop();
    option.textContent = fileName;
    option.title = filePath;
    filePathDropdown.appendChild(option);
  });
  if (currentSelection && currentSelection !== "all") {
    for (let i = 0; i < filePathDropdown.options.length; i++) {
      if (filePathDropdown.options[i].value === currentSelection) {
        filePathDropdown.selectedIndex = i;
        break;
      }
    }
  }
};
